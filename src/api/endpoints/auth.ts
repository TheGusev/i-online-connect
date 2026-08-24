import { USE_MOCKS, request, setToken } from "../client";
import { mockApi } from "../mocks";
import type { Session, User } from "../types";

export async function login(email: string, password: string): Promise<Session> {
  const session = USE_MOCKS
    ? await mockApi.login(email)
    : await request<Session>("/auth/login", { method: "POST", body: { email, password } });
  setToken(session.token);
  return session;
}

/** Регистрация в конце онбординга: сразу выдаёт access-токен. */
export async function register(email: string, password: string, name: string): Promise<Session> {
  const session = USE_MOCKS
    ? await mockApi.register(email, name)
    : await request<Session>("/auth/register", {
        method: "POST",
        body: { email, password, name },
      });
  setToken(session.token);
  return session;
}

export async function logout(): Promise<void> {
  if (!USE_MOCKS) await request<void>("/auth/logout", { method: "POST" });
  setToken(null);
}

export async function getCurrentUser(): Promise<User> {
  return USE_MOCKS ? mockApi.currentUser() : request<User>("/auth/me");
}
