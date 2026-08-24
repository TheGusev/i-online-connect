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
