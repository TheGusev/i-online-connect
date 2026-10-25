import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import { z } from "zod";

export const OAUTH_TTL_MS = 10 * 60_000;
export const providerSchema = z.enum(["yandex", "telegram"]);
export type OAuthProvider = z.infer<typeof providerSchema>;
const flowSchema = z.object({ provider: providerSchema, state: z.string().regex(/^[\w-]{43}$/),
  verifier: z.string().regex(/^[\w-]{43}$/), nonce: z.string().regex(/^[\w-]{43}$/),
  expires: z.number().int(), userId: z.string().uuid().optional() });
export type OAuthFlow = z.infer<typeof flowSchema>;
export const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
export const pkceChallenge = digest;
export function createFlow(provider: OAuthProvider, userId?: string): OAuthFlow {
  return { provider, state: randomBytes(32).toString("base64url"), verifier: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"), expires: Date.now() + OAUTH_TTL_MS, ...(userId ? { userId } : {}) };
}
export function signFlow(flow: OAuthFlow, secret: string) {
  const body = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function readFlow(cookie: string | undefined, secret: string, provider: OAuthProvider, state: string): OAuthFlow {
  if (!cookie || cookie.length > 2048) throw new Error("oauth_cookie_missing");
  const [body, mac, extra] = cookie.split(".");
  if (!body || !mac || extra) throw new Error("oauth_cookie_invalid");
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("oauth_cookie_signature");
  const flow = flowSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
  if (flow.provider !== provider || flow.state !== state || flow.expires <= Date.now() || flow.expires > Date.now() + OAUTH_TTL_MS) throw new Error("oauth_state_invalid");
  return flow;
}

export const jwksSchema = z.object({ keys: z.array(z.object({ kty: z.literal("RSA"), kid: z.string().max(200),
  n: z.string().min(100).max(1500), e: z.string().max(16), alg: z.string().optional(), use: z.string().optional() }).passthrough()).max(30) });
export type TelegramKey = z.infer<typeof jwksSchema>["keys"][number];
const claimsSchema = z.object({ iss: z.literal("https://oauth.telegram.org"), aud: z.union([z.string(), z.array(z.string()).max(10)]),
  sub: z.string().min(1).max(200), exp: z.number().int(), iat: z.number().int(), nonce: z.string(),
  azp: z.string().optional(), nbf: z.number().optional(), name: z.string().max(200).optional(),
  phone_number: z.string().max(32).optional(), phone_number_verified: z.boolean().optional() });
export function verifyTelegramToken(token: string, keys: TelegramKey[], clientId: string, nonce: string) {
  if (token.length > 16384) throw new Error("telegram_token_size");
  const parts = token.split(".");
  const [headerPart, payloadPart, signaturePart] = parts;
  if (parts.length !== 3 || !headerPart || !payloadPart || !signaturePart) throw new Error("telegram_token_format");
  const header = z.object({ alg: z.literal("RS256"), kid: z.string() }).parse(JSON.parse(Buffer.from(headerPart, "base64url").toString()));
  const key = keys.find(key => key.kid === header.kid && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
  if (!key) throw new Error("telegram_key_missing");
  const publicKey = createPublicKey({ key: key as JsonWebKey, format: "jwk" });
  if (!verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), publicKey, Buffer.from(signaturePart, "base64url"))) throw new Error("telegram_signature_invalid");
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(payloadPart, "base64url").toString()));
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const now = Date.now() / 1000;
  if (!audiences.includes(clientId) || (audiences.length > 1 && claims.azp !== clientId) || (claims.azp && claims.azp !== clientId) ||
      claims.exp <= now || claims.iat > now + 30 || (claims.nbf && claims.nbf > now) || claims.nonce !== nonce) throw new Error("telegram_claims_invalid");
  return claims;
}