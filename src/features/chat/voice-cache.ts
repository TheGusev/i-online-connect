import { useSessionStore } from "@/store/useSessionStore";

/**
 * Локальный кэш голосовых: файл + готовая волна. Сервер отдаёт вложения с
 * no-store, а Cache Storage этот заголовок не обязан соблюдать. Права на файл
 * проверяются при первой загрузке. Кэш привязан к пользователю и стирается
 * только при выходе (guest) или смене пользователя; временный offline его не трогает.
 */
const PREFIX = "ya-voice-";
const VERSION = "v2";
const MAX_ENTRIES = 600;
let watching = false;
let cleanedFor = "";

export interface CachedVoice {
  buffer: ArrayBuffer;
  peaks: number[] | null;
}

function supported() {
  return typeof window !== "undefined" && "caches" in window;
}

function cacheName(): string | null {
  const id = useSessionStore.getState().user?.id;
  return id ? `${PREFIX}${VERSION}-${id}` : null;
}

export async function clearVoiceCache(): Promise<void> {
  if (!supported()) return;
  const names = await caches.keys().catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n.startsWith(PREFIX)).map((n) => caches.delete(n)));
  cleanedFor = "";
}

function watchSession() {
  if (watching) return;
  watching = true;
  useSessionStore.subscribe((state, previous) => {
    const loggedOut = state.status === "guest" && previous.status !== "guest";
    const switched = Boolean(previous.user && state.user && previous.user.id !== state.user.id);
    if (loggedOut || switched) void clearVoiceCache();
  });
}

async function openCache(): Promise<Cache | null> {
  const name = cacheName();
  if (!supported() || !name) return null;
  watchSession();
  const cache = await caches.open(name);
  if (cleanedFor !== name) {
    cleanedFor = name;
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== name).map((n) => caches.delete(n)));
  }
  return cache;
}

export async function readVoiceCache(src: string): Promise<CachedVoice | null> {
  try {
    const cache = await openCache();
    if (!cache) return null;
    const hit = await cache.match(src);
    if (!hit) return null;
    let peaks: number[] | null = null;
    const raw = hit.headers.get("X-Peaks");
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) peaks = parsed as number[];
      } catch {
        peaks = null;
      }
    }
    return { buffer: await hit.arrayBuffer(), peaks };
  } catch {
    return null;
  }
}

export async function writeVoiceCache(src: string, buffer: ArrayBuffer, peaks: number[] | null): Promise<void> {
  try {
    const cache = await openCache();
    if (!cache) return;
    const headers = new Headers({ "Content-Type": "audio/mp4" });
    if (peaks) headers.set("X-Peaks", JSON.stringify(peaks.map((v) => Math.round(v * 100) / 100)));
    await cache.put(src, new Response(buffer.slice(0), { headers }));
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      await cache.delete(key);
    }
  } catch {
    // кэш необязателен: при ошибке работаем без него
  }
}
