/**
 * Единый API-клиент. Все обращения к данным идут только через этот слой.
 *
 * Мок-адаптер (src/api/mocks) включается ровно одним флагом: VITE_USE_MOCKS=true.
 * В продакшене достаточно задать VITE_API_URL и VITE_USE_MOCKS=false —
 * все вызовы уйдут в реальный REST API.
 */

export const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export const WS_URL = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "";

export const APP_NAME = (import.meta.env["VITE_APP_NAME"] as string | undefined) ?? "Я Онлайн";

/** Единственный переключатель мок-данных. */
export const USE_MOCKS = (import.meta.env["VITE_USE_MOCKS"] as string | undefined) === "true";

if (!USE_MOCKS && API_URL === "" && typeof window !== "undefined") {
  console.error(
    "[api] VITE_API_URL не задан, а VITE_USE_MOCKS выключен — запросы к backend невозможны. " +
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
