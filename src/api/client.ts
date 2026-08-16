/**
 * Единый API-клиент. Все обращения к данным идут только через этот слой.
 *
 * Пока внешний backend не готов, работает мок-адаптер (src/api/mock).
 * Чтобы перейти на реальный REST API — достаточно задать VITE_API_URL
 * и VITE_USE_MOCK=false: тогда все вызовы уйдут в реальный fetch.
 */

export const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export const USE_MOCK =
  (import.meta.env["VITE_USE_MOCK"] as string | undefined) === "true" || API_URL === "";

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
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(
    path.replace(/^\//, ""),
    API_URL.endsWith("/") ? API_URL : `${API_URL}/`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Реальный HTTP-запрос к внешнему REST API. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal } = options;
  const token = getToken();

  const response = await fetch(buildUrl(path, query), {
    method,
    signal: signal ?? null,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* тело ответа не JSON — оставляем код статуса */
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
