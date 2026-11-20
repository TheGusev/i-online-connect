import { request, setToken, getToken, getSessionRevision, isSessionCurrent, ApiError, OFFLINE_MESSAGE, API_URL } from "../client";
import { createLogoutController } from "../logout-controller.mjs";
import type { Session, User } from "../types";

const logoutController = createLogoutController({
  getToken,
  setToken,
  revoke: async (token, signal) => {
    const base = new URL(API_URL.endsWith("/") ? API_URL : `${API_URL}/`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    let response: Response;
    try {
      response = await fetch(new URL("auth/logout", base).toString(), {
        method: "POST", credentials: "include", signal,
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch (cause) {
      if ((cause as { name?: string })?.name === "AbortError") throw cause;
      throw new ApiError(0, OFFLINE_MESSAGE);
    }
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let code: string | undefined;
      try {
        const data = (await response.json()) as { message?: string; error?: string };
        if (data.message) message = data.message;
        if (typeof data.error === "string") code = data.error;
      } catch { /* Keep the status if the response is not JSON. */ }
      throw new ApiError(response.status, message, code);
    }
  },
});
function assertCurrent(revision: number) {
  if (!isSessionCurrent(revision)) {
    const error = new Error("Session changed");
    error.name = "AbortError";
    throw error;
  }
}
async function authenticate<T extends { token: string }>(path: string, body: unknown): Promise<T> {
  const revision = getSessionRevision();
  await logoutController.waitForLogout();
  assertCurrent(revision);
  const result = await request<T>(path, { method: "POST", body });
  assertCurrent(revision);
  setToken(result.token);
  return result;
}
export function login(email: string, password: string): Promise<Session> {
  return authenticate<Session>("/auth/login", { email, password });
}
/** Регистрация в конце онбординга: сразу выдаёт access-токен. */
export function register(email: string, password: string, name: string): Promise<Session> {
  return authenticate<Session>("/auth/register", { email, password, name });
}
export const logout = logoutController.logout;
export async function getCurrentUser(): Promise<User> {
  return request<User>("/auth/me");
}
/** Запрос SMS-кода. Сервер всегда отвечает одинаково (204). */
export async function requestPhoneCode(phone: string): Promise<void> {
  await request<void>("/auth/phone/request", { method: "POST", body: { phone } });
}
export function verifyPhoneCode(phone: string, code: string): Promise<Session & { isNew: boolean }> {
  return authenticate<Session & { isNew: boolean }>("/auth/phone/verify", { phone, code });
}
export type OAuthProvider = "yandex" | "telegram";
export type AuthConfig = {
  passwordResetEnabled: boolean;
  phoneLoginEnabled?: boolean;
  emailConfirmationEnabled?: boolean;
  providers: Record<OAuthProvider, boolean>;
};
export const getAuthConfig = () => request<AuthConfig>("/auth/config");
export function socialStartUrl(provider: OAuthProvider) {
  return `${API_URL.replace(/\/$/, "")}/auth/${provider}/start`;
}
export const startIdentityLink = (provider: OAuthProvider) =>
  request<{ url: string }>(`/auth/identities/${provider}/link/start`, { method: "POST" });
export const getIdentities = () => request<{ linked: string[]; email: boolean; phone: boolean }>("/auth/identities");
export const unlinkIdentity = (provider: OAuthProvider) => request<void>(`/auth/identities/${provider}`, { method: "DELETE" });
export async function completeOAuth(provider: OAuthProvider, state: string) {
  const result = await authenticate<{ token: string; isNew: boolean }>("/auth/oauth/result", { provider, state });
  const revision = getSessionRevision();
  const user = await getCurrentUser();
  assertCurrent(revision);
  return { ...result, user };
}
export const requestPasswordReset = (email: string) =>
  request<void>("/auth/password/reset/request", { method: "POST", body: { email } });
export const confirmPasswordReset = (email: string, code: string, newPassword: string) =>
  request<void>("/auth/password/reset/confirm", { method: "POST", body: { email, code, newPassword } });
export const requestPhoneLink = (phone: string) =>
  request<void>("/auth/phone/link/request", { method: "POST", body: { phone } });
export const verifyPhoneLink = (phone: string, code: string) =>
  request<{ status: "verified" }>("/auth/phone/link/verify", { method: "POST", body: { phone, code } });
