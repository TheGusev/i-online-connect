import { request, setToken, API_URL } from "../client";
import type { Session, User } from "../types";

export async function login(email: string, password: string): Promise<Session> {
  const session = await request<Session>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setToken(session.token);
  return session;
}

/** Регистрация в конце онбординга: сразу выдаёт access-токен. */
export async function register(email: string, password: string, name: string): Promise<Session> {
  const session = await request<Session>("/auth/register", {
    method: "POST",
    body: { email, password, name },
  });
  setToken(session.token);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await request<void>("/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export async function getCurrentUser(): Promise<User> {
  return request<User>("/auth/me");
}

/** Запрос SMS-кода. Сервер всегда отвечает одинаково (204). */
export async function requestPhoneCode(phone: string): Promise<void> {
  await request<void>("/auth/phone/request", { method: "POST", body: { phone } });
}

export async function verifyPhoneCode(
  phone: string,
  code: string,
): Promise<Session & { isNew: boolean }> {
  const session = await request<Session & { isNew: boolean }>("/auth/phone/verify", {
    method: "POST",
    body: { phone, code },
  });
  setToken(session.token);
  return session;
}

export type OAuthProvider = "yandex" | "telegram";
export type AuthConfig = { passwordResetEnabled: boolean; providers: Record<OAuthProvider, boolean> };
export const getAuthConfig = () => request<AuthConfig>("/auth/config");
export function socialStartUrl(provider: OAuthProvider) {
  return `${API_URL.replace(/\/$/, "")}/auth/${provider}/start`;
}
export const startIdentityLink = (provider: OAuthProvider) => request<{ url: string }>(`/auth/identities/${provider}/link/start`, { method: "POST" });
export const getIdentities = () => request<{ linked: string[]; email: boolean; phone: boolean }>("/auth/identities");
export const unlinkIdentity = (provider: OAuthProvider) => request<void>(`/auth/identities/${provider}`, { method: "DELETE" });
export async function completeOAuth(provider: OAuthProvider, state: string) {
  const result = await request<{ token: string; isNew: boolean }>("/auth/oauth/result", { method: "POST", body: { provider, state } });
  setToken(result.token);
  const user = await getCurrentUser();
  return { ...result, user };
}
export const requestPasswordReset = (email: string) => request<void>("/auth/password/reset/request", { method: "POST", body: { email } });
export const confirmPasswordReset = (email: string, code: string, newPassword: string) => request<void>("/auth/password/reset/confirm", { method: "POST", body: { email, code, newPassword } });
export const requestPhoneLink = (phone: string) => request<void>("/auth/phone/link/request", { method: "POST", body: { phone } });
export const verifyPhoneLink = (phone: string, code: string) => request<{ status: "verified" }>("/auth/phone/link/verify", { method: "POST", body: { phone, code } });
