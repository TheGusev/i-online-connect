import { z } from "zod";
import { env } from "../env.ts";
import { jwksSchema, pkceChallenge, verifyTelegramToken, type OAuthFlow, type OAuthProvider, type TelegramKey } from "./oauth-security.ts";

export type ProviderProfile = { subject: string; name: string; phone?: string; phoneVerified: boolean };
export function providerEnabled(provider: OAuthProvider) {
  return provider === "yandex" ? Boolean(env.YANDEX_CLIENT_ID && env.YANDEX_CLIENT_SECRET) : Boolean(env.TELEGRAM_CLIENT_ID && env.TELEGRAM_CLIENT_SECRET);
}
function credentials(provider: OAuthProvider) {
  return provider === "yandex" ? { id: env.YANDEX_CLIENT_ID, secret: env.YANDEX_CLIENT_SECRET } : { id: env.TELEGRAM_CLIENT_ID, secret: env.TELEGRAM_CLIENT_SECRET };
}
export function publicBase() {
  const url = new URL(env.PUBLIC_BASE_URL);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && url.protocol === "http:"))) throw new Error("oauth_base_invalid");
  return url.origin;
}
export const callbackUrl = (provider: OAuthProvider) => `${publicBase()}/api/auth/${provider}/callback`;
export function authorizationUrl(flow: OAuthFlow) {
  const url = new URL(flow.provider === "yandex" ? "https://oauth.yandex.ru/authorize" : "https://oauth.telegram.org/auth");
  const params = { response_type: "code", client_id: credentials(flow.provider).id, redirect_uri: callbackUrl(flow.provider),
    scope: flow.provider === "yandex" ? "login:info login:email login:default_phone" : "openid profile phone",
    state: flow.state, code_challenge: pkceChallenge(flow.verifier), code_challenge_method: "S256", nonce: flow.nonce };
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}
async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  // Bound even chunked responses; never log provider payloads.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("provider_empty_response");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > 65536) throw new Error("provider_response_size"); chunks.push(value); }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
let cache: { keys: TelegramKey[]; expires: number } | undefined;
let pending: Promise<TelegramKey[]> | undefined;
async function telegramKeys(force = false): Promise<TelegramKey[]> {
  if (!force && cache && cache.expires > Date.now()) return cache.keys;
  if (pending) return pending;
  pending = fetchJson("https://oauth.telegram.org/.well-known/jwks.json").then(data => {
    const keys = jwksSchema.parse(data).keys; cache = { keys, expires: Date.now() + 5 * 60_000 }; return keys;
  }).finally(() => { pending = undefined; });
  return pending;
}
export function yandexProfile(data: unknown): ProviderProfile {
  const info = z.object({ id: z.string().min(1).max(200), display_name: z.string().max(200).optional(),
    real_name: z.string().max(200).optional(), first_name: z.string().max(200).optional(),
    default_phone: z.object({ number: z.string().max(32) }).optional() }).parse(data);
  // Official default_phone has no verification claim. Do not infer possession from presence.
  return { subject: info.id, name: (info.display_name || info.real_name || info.first_name || "").slice(0, 80), phoneVerified: false };
}
export async function exchangeProfile(flow: OAuthFlow, code: string): Promise<ProviderProfile> {
  const { id, secret } = credentials(flow.provider);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, redirect_uri: callbackUrl(flow.provider), code_verifier: flow.verifier });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (flow.provider === "telegram") headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  else body.set("client_secret", secret);
  const token = await fetchJson(flow.provider === "telegram" ? "https://oauth.telegram.org/token" : "https://oauth.yandex.ru/token", { method: "POST", headers, body });
  if (flow.provider === "yandex") {
    const result = z.object({ access_token: z.string().min(1).max(16384) }).parse(token);
    return yandexProfile(await fetchJson("https://login.yandex.ru/info?format=json", { headers: { Authorization: `OAuth ${result.access_token}` } }));
  }
  const { id_token } = z.object({ id_token: z.string().max(16384) }).parse(token);
  let keys = await telegramKeys();
  let claims;
  try { claims = verifyTelegramToken(id_token, keys, id, flow.nonce); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "telegram_key_missing") throw error;
    // Unknown kid: rotate keys at most once per minute to resist forced-fetch abuse.
    if (cache && cache.expires - 4 * 60_000 > Date.now()) throw error;
    keys = await telegramKeys(true); claims = verifyTelegramToken(id_token, keys, id, flow.nonce);
  }
  return { subject: claims.sub, name: (claims.name ?? "").slice(0, 80), phone: claims.phone_number ? `+${claims.phone_number.replace(/^\+/, "")}` : undefined,
    phoneVerified: claims.phone_number_verified === true };
}