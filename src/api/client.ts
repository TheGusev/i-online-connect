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

/**
 * Абсолютный адрес пользовательского файла.
 *
 * Сервер отдаёт относительные пути вида `/media/<id>/<file>.jpg`. Если сайт и
 * API живут на одном домене (прод за Nginx) — путь рабочий как есть. Если нет
 * (разработка, отдельный домен API) — относительный путь ушёл бы на домен
 * сайта, где файла нет, и фото «не грузилось». Поэтому приклеиваем origin API.
 */
/** Префиксы, по которым backend раздаёт пользовательские файлы. */
const MEDIA_PREFIXES = ["/media/", "/api/media-file/", "/uploads/"];

export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  // Локальные ассеты сборки (/assets/...) отдаёт сам сайт — их не трогаем.
  if (!MEDIA_PREFIXES.some((prefix) => url.startsWith(prefix)) || API_URL === "") return url;
  try {
    return new URL(url, API_URL).toString();
  } catch {
    return url;
  }
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

export type RefreshResult =
  | { kind: "ok"; token: string }
  | { kind: "invalid" }
  | { kind: "temporary" };

/** Событие для стора сессии: сервер признал сессию недействительной. */
export const SESSION_INVALID_EVENT = "ya-online:session-invalid";
/** Событие возврата в приложение: сокеты переподключаются, если закрыты. */
export const RESUME_EVENT = "ya-online:resume";

export const OFFLINE_MESSAGE = "Нет связи с сервером — попробуйте ещё раз";
const REFRESH_TIMEOUT_MS = 10_000;

async function doRefresh(): Promise<RefreshResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { kind: "invalid" };
    if (!response.ok) return { kind: "temporary" };
    const data = (await response.json()) as { token?: string };
    return data?.token ? { kind: "ok", token: data.token } : { kind: "temporary" };
  } catch (error) {
    console.error("[api] refresh не удался:", error);
    return { kind: "temporary" };
  } finally {
    clearTimeout(timer);
  }
}

let refreshInFlight: Promise<RefreshResult> | null = null;

/**
 * Единая на всё приложение попытка обновления токена: параллельные вызовы
 * ждут один и тот же запрос /auth/refresh. Токен сохраняется/стирается здесь.
 */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh()
      .then((result) => {
        if (result.kind === "ok") setToken(result.token);
        else if (result.kind === "invalid") {
          setToken(null);
          if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
        }
        return result;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Секунды до истечения access-токена (из JWT) или null, если не разобрать. */
function tokenSecondsLeft(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp - Date.now() / 1000 : null;
  } catch {
    return null;
  }
}

/** Обновить токен заранее, если он истёк или истекает в ближайшие 60 секунд. */
export async function ensureFreshToken(): Promise<RefreshResult | null> {
  const token = getToken();
  if (!token) return null;
  const left = tokenSecondsLeft(token);
  if (left !== null && left > 60) return null;
  return refreshAccessToken();
}

/**
 * Реакция на 401: если токен уже сменился, пока шёл запрос, — просто
 * повторяем с новым; иначе ждём общее обновление.
 * Возвращает токен для повтора, null — повторять нечего (сессия кончилась).
 * При временной ошибке бросает ApiError «нет связи», токен не трогаем.
 */
async function tokenAfter401(sentToken: string): Promise<string | null> {
  const current = getToken();
  if (current && current !== sentToken) return current;
  const result = await refreshAccessToken();
  if (result.kind === "ok") return result.token;
  if (result.kind === "temporary") throw new ApiError(0, OFFLINE_MESSAGE);
  return null;
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
  let response: Response;
  try {
    response = await send(path, options, token);
  } catch (cause) {
    if ((cause as { name?: string })?.name === "AbortError") throw cause;
    throw new ApiError(0, OFFLINE_MESSAGE);
  }

  // Access-токен живёт 15 минут: один раз обновляем его и повторяем запрос.
  if (response.status === 401 && token && !path.includes("/auth/refresh")) {
    const next = await tokenAfter401(token);
    if (next) {
      try {
        response = await send(path, options, next);
      } catch (cause) {
        if ((cause as { name?: string })?.name === "AbortError") throw cause;
        throw new ApiError(0, OFFLINE_MESSAGE);
      }
    }
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Сколько ждём завершения загрузки файла, прежде чем показать ошибку. */
export const UPLOAD_TIMEOUT_MS = 30_000;

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  /** Видео на мобильной сети требует больше времени, чем обычное фото. */
  timeoutMs?: number;
  timeoutMessage?: string;
}

/**
 * Загрузка файла с прогрессом и таймаутом.
 *
 * fetch не сообщает прогресс отправки и без таймаута может «висеть» вечно —
 * поэтому файлы уходят через XHR: пользователь видит проценты, а через
 * UPLOAD_TIMEOUT_MS получает понятную ошибку вместо бесконечного «Загружаем…».
 */
export function upload<T>(
  path: string,
  form: FormData,
  options: UploadOptions | ((percent: number) => void) = {},
): Promise<T> {
  const normalized =
    typeof options === "function" ? { onProgress: options } : options;

  const attempt = (token: string | null, canRefresh: boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path), true);
    xhr.withCredentials = true;
    xhr.timeout = normalized.timeoutMs ?? UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Accept", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && normalized.onProgress) {
        normalized.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.ontimeout = () =>
      reject(
        new ApiError(
          408,
          normalized.timeoutMessage ?? "Загрузка заняла слишком много времени — попробуйте ещё раз",
        ),
      );
    xhr.onerror = () => reject(new ApiError(0, "Нет связи с сервером — попробуйте ещё раз"));
    xhr.onload = async () => {
      if (xhr.status === 401 && token && canRefresh) {
        try {
          const next = await tokenAfter401(token);
          if (next) {
            attempt(next, false).then(resolve, reject);
            return;
          }
        } catch (cause) {
          reject(cause);
          return;
        }
      }

      normalized.onProgress?.(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as T) : (undefined as T));
        } catch {
          reject(new ApiError(xhr.status, "Сервер вернул неожиданный ответ"));
        }
        return;
      }
      let message = xhr.status === 413 ? "Файл слишком большой" : `HTTP ${xhr.status}`;
      try {
        const data = JSON.parse(xhr.responseText) as { message?: string };
        if (data?.message) message = data.message;
      } catch {
        /* тело не JSON — оставляем понятный текст по статусу */
      }
      reject(new ApiError(xhr.status, message));
    };

    xhr.send(form);
  });

  return attempt(getToken(), true);
}
