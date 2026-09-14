/**
 * Защита от белого экрана после обновления сборки.
 *
 * После деплоя старый index.html (закешированный вебвью установленного PWA)
 * ссылается на JS-чанки с прежними хэшами, которых на сервере уже нет.
 * Браузер не может загрузить модуль — приложение не стартует, экран пустой.
 *
 * Здесь мы перехватываем именно такие ошибки загрузки кода и один раз
 * перезагружаем страницу (с обходом кеша). Флаг попытки живёт в
 * sessionStorage, поэтому цикла перезагрузок не будет: при повторном сбое
 * показываем понятный экран с кнопкой «Обновить».
 */
const RELOAD_FLAG = "ya-online:chunk-reload";

const CHUNK_ERROR_PATTERNS = [
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "failed to load module script",
];

let installed = false;
let fatal = false;
const listeners = new Set<() => void>();

function markFatal() {
  if (fatal) return;
  fatal = true;
  for (const listener of listeners) listener();
}

function isChunkError(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.name} ${value.message}`
      : typeof value === "string"
        ? value
        : "";
  if (!message) return false;
  const lower = message.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Один раз перезагрузить страницу; при повторе — показать экран ошибки. */
function recover() {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === "1";
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // Приватный режим: без флага делаем ровно одну попытку в этой сессии JS.
    alreadyTried = fatal;
  }

  if (alreadyTried) {
    markFatal();
    return;
  }

  void (async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // Service worker не обязателен для восстановления.
    }
    window.location.reload();
  })();
}

/** Сбросить флаг: приложение успешно загрузилось. */
export function markAppLoaded() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
}

export function isChunkRecoveryFatal() {
  return fatal;
}

export function subscribeChunkRecovery(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installChunkRecovery() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as (HTMLElement & { src?: string; href?: string }) | null;
      const tag = target?.tagName?.toLowerCase();
      // Не загрузился наш <script type="module"> или <link rel=stylesheet> —
      // тот же случай. Сторонние скрипты (счётчик Метрики) игнорируем:
      // из-за блокировщика они падают штатно и перезагрузка не нужна.
      if (tag === "script" || tag === "link") {
        const url = target?.src || target?.href || "";
        if (url && isOwnBundleUrl(url)) recover();
        return;
      }
      if (isChunkError(event.error) || isChunkError(event.message)) recover();
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkError(event.reason)) recover();
  });
}
