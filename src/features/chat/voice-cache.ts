import { useSessionStore } from "@/store/useSessionStore";

/**
 * Локальный кэш голосовых сообщений.
 *
 * Сервер отдаёт вложения с `Cache-Control: no-store`, поэтому браузер сам их не
 * сохраняет и каждое открытие чата качает файлы заново. Cache Storage управляется
 * приложением и заголовок no-store не обязан соблюдать. Права на файл проверяются
 * при первой загрузке; при выходе из аккаунта или смене пользователя кэш стирается.
 */
const CACHE_NAME = "ya-voice-v1";
const MAX_ENTRIES = 400;
let watching = false;

function supported() {
  return typeof window !== "undefined" && "caches" in window;
}

export async function clearVoiceCache(): Promise<void> {
  if (!supported()) return;
  await caches.delete(CACHE_NAME).catch(() => false);
}

function watchSession() {
  if (watching) return;
  watching = true;
  useSessionStore.subscribe((state, previous) => {
    const left = previous.status === "authed" &&
      (state.status !== "authed" || state.user?.id !== previous.user?.id);
    if (left) void clearVoiceCache();
  });
}

export async function readVoiceCache(src: string): Promise<ArrayBuffer | null> {
  if (!supported()) return null;
  watchSession();
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(src);
    return hit ? await hit.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function writeVoiceCache(src: string, buffer: ArrayBuffer): Promise<void> {
  if (!supported()) return;
  watchSession();
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(src, new Response(buffer.slice(0), { headers: { "Content-Type": "audio/mp4" } }));
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      await cache.delete(key);
    }
  } catch {
    /* кэш необязателен: при ошибке просто работаем без него */
  }
}
