import {
  API_URL, ApiError, ensureFreshToken, getSessionRevision, getToken,
  isSessionCurrent, refreshAccessToken, request, upload,
} from "@/api/client";
import type { RequestOptions } from "@/api/client";
import type { StoryCursor, StoryPage } from "./model";

function assertScope(revision: number) {
  if (!isSessionCurrent(revision)) {
    const error = new Error("Session changed");
    error.name = "AbortError";
    throw error;
  }
}
async function call<T>(path: string, options: RequestOptions = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = window.setTimeout(abort, 15000);
  try {
    return await request<T>(path, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const storiesApi = {
  list(cursor: StoryCursor | null, signal: AbortSignal) {
    return call<StoryPage>("/stories/", {
      signal,
      ...(cursor ? { query: { beforeAt: cursor.at, beforeId: cursor.id } } : {}),
    });
  },
  view(id: string) {
    return call<{ ok: boolean }>(`/stories/${encodeURIComponent(id)}/view`, {
      method: "POST",
    });
  },
  remove(id: string) {
    return call<{ ok: boolean }>(`/stories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  async publish(
    file: File, caption: string, clientTempId: string,
    onProgress: (value: number) => void,
  ) {
    const revision = getSessionRevision();
    await ensureFreshToken();
    assertScope(revision);
    if (!getToken()) throw new ApiError(401, "Нужно снова войти в аккаунт");
    const body = new FormData();
    body.append("clientTempId", clientTempId);
    body.append("caption", caption);
    body.append("file", file);
    const result = await upload<{ id: string; created: boolean }>("/stories/", body, {
      timeoutMs: 120000,
      timeoutMessage: "Публикация заняла слишком много времени. Повторите попытку — запрос защищён от дублей.",
      onProgress: value => {
        if (isSessionCurrent(revision)) onProgress(value);
      },
    });
    assertScope(revision);
    return result;
  },
  async media(id: string, signal: AbortSignal) {
    const revision = getSessionRevision();
    await ensureFreshToken();
    assertScope(revision);
    const base = new URL(API_URL.endsWith("/") ? API_URL : API_URL + "/", location.origin);
    const url = new URL(`stories/${encodeURIComponent(id)}/media`, base);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = window.setTimeout(abort, 60000);
    try {
      const send = () => {
        assertScope(revision);
        const token = getToken();
        if (!token) throw new ApiError(401, "Нужно снова войти в аккаунт");
        return fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include", cache: "no-store",
          redirect: "error", signal: controller.signal,
        });
      };
      let response = await send();
      assertScope(revision);
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        assertScope(revision);
        if (refreshed.kind !== "ok") {
          throw new ApiError(401, "Не удалось подтвердить сессию");
        }
        response = await send();
      }
      assertScope(revision);
      if (!response.ok) {
        throw new ApiError(response.status,
          response.status === 404 ? "История удалена или больше недоступна" : "Не удалось загрузить историю");
      }
      const blob = await response.blob();
      assertScope(revision);
      if (signal.aborted || controller.signal.aborted) {
        throw new DOMException("Загрузка отменена", "AbortError");
      }
      if (!["image/jpeg", "video/mp4"].includes(blob.type) ||
          blob.size <= 0 || blob.size > 45 * 1024 * 1024) {
        throw new ApiError(422, "Некорректный файл истории");
      }
      return blob;
    } finally {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  },
};
