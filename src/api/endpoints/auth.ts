import { request, setToken } from "../client";
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

export const getAuthConfig = () => request<{ passwordResetEnabled: boolean }>("/auth/config");
export const requestPasswordReset = (email: string) => request<void>("/auth/password/reset/request", { method: "POST", body: { email } });
export const confirmPasswordReset = (email: string, code: string, newPassword: string) => request<void>("/auth/password/reset/confirm", { method: "POST", body: { email, code, newPassword } });
export const requestPhoneLink = (phone: string) => request<void>("/auth/phone/link/request", { method: "POST", body: { phone } });
export const verifyPhoneLink = (phone: string, code: string) => request<{ status: "verified" }>("/auth/phone/link/verify", { method: "POST", body: { phone, code } });
