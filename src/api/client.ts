/**
 * Единый API-клиент. Все обращения к данным идут только через этот слой.
 *
 * Мок-данных больше нет: единственный источник — REST API по VITE_API_URL.
 */

export const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export const WS_URL = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "";

export const APP_NAME = (import.meta.env["VITE_APP_NAME"] as string | undefined) ?? "Я Онлайн";

if (API_URL === "" && typeof window !== "undefined") {
  console.error(
    "[api] VITE_API_URL не задан — запросы к backend невозможны. " +
      "Укажите VITE_API_URL при сборке (см. .env.example и DEPLOY.md).",
  );
}

const TOKEN_STORAGE_KEY = "ya-online.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Объект уходит как JSON, FormData — как multipart (файлы). */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(path.replace(/^\//, ""), API_URL.endsWith("/") ? API_URL : `${API_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function send(path: string, options: RequestOptions, token: string | null) {
  const { method = "GET", body, query, signal } = options;
  // Content-Type для FormData ставит браузер сам — вместе с boundary.
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  return fetch(buildUrl(path, query), {
    method,
    signal: signal ?? null,
    // Нужно для httpOnly refresh-cookie: без include она не отправляется.
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: isForm ? (body as FormData) : JSON.stringify(body) } : {}),
  });
}

/** Обновление access-токена по httpOnly-cookie. Возвращает новый токен или null. */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { token?: string };
    return data?.token ?? null;
  } catch (error) {
    console.error("[api] refresh не удался:", error);
    return null;
  }
}

async function toApiError(response: Response) {
  let message = `HTTP ${response.status}`;
  try {
    const data = (await response.json()) as { message?: string };
    if (data?.message) message = data.message;
  } catch {
    /* тело ответа не JSON — оставляем код статуса */
  }
  return new ApiError(response.status, message);
}

/** Реальный HTTP-запрос к внешнему REST API. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  let response = await send(path, options, token);

  // Access-токен живёт 15 минут: один раз пробуем обновить его и повторить запрос.
  if (response.status === 401 && token && !path.includes("/auth/refresh")) {
    const next = await refreshAccessToken();
    if (next) {
      setToken(next);
      response = await send(path, options, next);
    } else {
      setToken(null);
    }
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
