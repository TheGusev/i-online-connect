import { createSessionScope } from "./session-scope.mjs";

/** Единый API-клиент; запросы и ответы привязаны к поколению сессии. */
export const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";
export const WS_URL = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "";
export const APP_NAME = (import.meta.env["VITE_APP_NAME"] as string | undefined) ?? "Я Онлайн";
if (API_URL === "" && typeof window !== "undefined") {
  console.error("[api] VITE_API_URL не задан — запросы к backend невозможны. Укажите VITE_API_URL при сборке (см. .env.example и DEPLOY.md).");
}
const MEDIA_PREFIXES = ["/media/", "/api/media-file/", "/uploads/"];
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (!MEDIA_PREFIXES.some(prefix => url.startsWith(prefix)) || API_URL === "") return url;
  try { return new URL(url, API_URL).toString(); } catch { return url; }
}
const TOKEN_STORAGE_KEY = "ya-online.token";
export const SESSION_INVALID_EVENT = "ya-online:session-invalid";
export const RESUME_EVENT = "ya-online:resume";
export const OFFLINE_MESSAGE = "Нет связи с сервером — попробуйте ещё раз";
const REFRESH_TIMEOUT_MS = 10_000;
const session = createSessionScope({
  readToken: () => typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_STORAGE_KEY),
  writeToken: token => {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  },
  refresh: doRefresh,
  onInvalid: () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
  },
});
export const getToken = session.getToken;
export const setToken = session.setToken;
export const getSessionRevision = () => session.capture().revision;
export const isSessionCurrent = session.isCurrent;
export const refreshAccessToken = session.refreshAccessToken;

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message); this.name = "ApiError"; this.status = status; this.code = code;
  }
}
export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}
function buildUrl(path: string, query?: RequestOptions["query"]) {
  const base = new URL(API_URL.endsWith("/") ? API_URL : `${API_URL}/`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const url = new URL(path.replace(/^\//, ""), base);
  if (query) for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
async function send(path: string, options: RequestOptions, token: string | null) {
  const { method = "GET", body, query, signal } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  return fetch(buildUrl(path, query), {
    method, signal: signal ?? null, credentials: "include",
    headers: { Accept: "application/json", ...(body && !isForm ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: isForm ? (body as FormData) : JSON.stringify(body) } : {}),
  });
}
export type RefreshResult =
  | { kind: "ok"; token: string }
  | { kind: "invalid" }
  | { kind: "temporary" }
  | { kind: "stale" };
async function doRefresh(signal: AbortSignal): Promise<RefreshResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, REFRESH_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl("/auth/refresh"), { method: "POST", credentials: "include", headers: { Accept: "application/json" }, signal: controller.signal });
    if (response.status === 401 || response.status === 403) return { kind: "invalid" };
    if (!response.ok) return { kind: "temporary" };
    const data = (await response.json()) as { token?: string };
    return data?.token ? { kind: "ok", token: data.token } : { kind: "temporary" };
  } catch (error) {
    if (signal.aborted) return { kind: "stale" };
    console.error("[api] refresh не удался:", error);
    return { kind: "temporary" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
function tokenSecondsLeft(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp - Date.now() / 1000 : null;
  } catch { return null; }
}
export async function ensureFreshToken(): Promise<RefreshResult | null> {
  const token = getToken();
  if (!token) return null;
  const left = tokenSecondsLeft(token);
  if (left !== null && left > 60) return null;
  return refreshAccessToken();
}
async function tokenAfter401(sentToken: string, revision: number): Promise<string | null> {
  session.assertCurrent(revision);
  const current = getToken();
  if (current && current !== sentToken) return current;
  const result = await refreshAccessToken();
  if (result.kind === "invalid") return null;
  session.assertCurrent(revision);
  if (result.kind === "ok") return result.token;
  if (result.kind === "temporary") throw new ApiError(0, OFFLINE_MESSAGE);
  const error = new Error("Session changed"); error.name = "AbortError"; throw error;
}
async function toApiError(response: Response) {
  let message = `HTTP ${response.status}`;
  let code: string | undefined;
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    if (data?.message) message = data.message;
    if (typeof data?.error === "string") code = data.error;
  } catch { /* Не JSON: сохраняем HTTP-статус. */ }
  return new ApiError(response.status, message, code);
}
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, revision } = session.capture();
  const sendCurrent = async (access: string | null) => {
    session.assertCurrent(revision);
    try { return await send(path, options, access); }
    catch (cause) {
      session.assertCurrent(revision);
      if ((cause as { name?: string })?.name === "AbortError") throw cause;
      throw new ApiError(0, OFFLINE_MESSAGE);
    }
  };
  let response = await sendCurrent(token);
  session.assertCurrent(revision);
  if (response.status === 401 && token && !path.includes("/auth/refresh")) {
    const next = await tokenAfter401(token, revision);
    if (next) response = await sendCurrent(next);
  }
  session.assertCurrent(revision);
  if (!response.ok) {
    const error = await toApiError(response);
    session.assertCurrent(revision);
    throw error;
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json()) as T;
  session.assertCurrent(revision);
  return data;
}
export const UPLOAD_TIMEOUT_MS = 30_000;
export interface UploadOptions {
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
  timeoutMessage?: string;
}
export function upload<T>(path: string, form: FormData, options: UploadOptions | ((percent: number) => void) = {}): Promise<T> {
  const normalized = typeof options === "function" ? { onProgress: options } : options;
  const { token, revision } = session.capture();
  const attempt = (access: string | null, canRefresh: boolean): Promise<T> => new Promise<T>((resolve, reject) => {
    session.assertCurrent(revision);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path), true); xhr.withCredentials = true;
    xhr.timeout = normalized.timeoutMs ?? UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Accept", "application/json");
    if (access) xhr.setRequestHeader("Authorization", `Bearer ${access}`);
    xhr.upload.onprogress = event => {
      if (isSessionCurrent(revision) && event.lengthComputable && normalized.onProgress) normalized.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    const fail = (error: ApiError) => {
      try { session.assertCurrent(revision); reject(error); } catch (cause) { reject(cause); }
    };
    xhr.ontimeout = () => fail(new ApiError(408, normalized.timeoutMessage ?? "Загрузка заняла слишком много времени — попробуйте ещё раз"));
    xhr.onerror = () => fail(new ApiError(0, OFFLINE_MESSAGE));
    xhr.onload = async () => {
      try {
        session.assertCurrent(revision);
        if (xhr.status === 401 && access && canRefresh) {
          const next = await tokenAfter401(access, revision);
          if (next) { attempt(next, false).then(resolve, reject); return; }
        }
        session.assertCurrent(revision);
        normalized.onProgress?.(100);
        session.assertCurrent(revision);
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as T) : (undefined as T)); }
          catch { reject(new ApiError(xhr.status, "Сервер вернул неожиданный ответ")); }
          return;
        }
        let message = xhr.status === 413 ? "Файл слишком большой" : `HTTP ${xhr.status}`;
        try { const data = JSON.parse(xhr.responseText) as { message?: string }; if (data?.message) message = data.message; } catch { /* Не JSON. */ }
        reject(new ApiError(xhr.status, message));
      } catch (cause) { reject(cause); }
    };
    xhr.send(form);
  });
  return attempt(token, true);
}
