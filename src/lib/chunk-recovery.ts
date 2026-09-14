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

/** Сколько ждём первый рендер приложения, прежде чем считать это белым экраном. */
const BOOT_TIMEOUT_MS = 9000;

let installed = false;
let fatal = false;
let appLoaded = false;
let bootTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Аварийный экран без React: приложение так и не смогло запуститься. */
function renderStandaloneFallback() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ya-online-boot-error")) return;
  const box = document.createElement("div");
  box.id = "ya-online-boot-error";
  box.setAttribute(
    "style",
    "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#0B0F1A;color:#F5F7FF;font-family:system-ui,-apple-system,sans-serif",
  );
  const title = document.createElement("h1");
  title.textContent = "Не удалось загрузить обновление";
  title.setAttribute("style", "margin:0;font-size:20px;font-weight:700");
  const text = document.createElement("p");
  text.textContent = "Проверьте соединение и попробуйте открыть приложение заново.";
  text.setAttribute("style", "margin:0;font-size:15px;opacity:.75;max-width:22rem");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Обновить";
  button.setAttribute(
    "style",
    "border:0;border-radius:999px;padding:12px 24px;font-size:15px;font-weight:600;background:#FF4D8D;color:#0B0F1A",
  );
  button.addEventListener("click", () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
    window.location.reload();
  });
  box.append(title, text, button);
  document.body.append(box);
}

function markFatal() {
  if (fatal) return;
  fatal = true;
  for (const listener of listeners) listener();
  // React не смонтировался — рисуем экран вручную, иначе пользователь
  // так и останется на пустом экране.
  if (!appLoaded) renderStandaloneFallback();
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

/** Наш ли это файл сборки (а не сторонний скрипт вроде счётчика). */
function isOwnBundleUrl(raw: string): boolean {
  try {
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin) return false;
    return /\.(js|mjs|css)$/i.test(url.pathname) || url.pathname.startsWith("/assets/");
  } catch {
    return false;
  }
}

/** Сбросить флаг: приложение успешно загрузилось. */
export function markAppLoaded() {
  appLoaded = true;
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
}

/**
 * Экран маршрута так и не отрисовался (роутер молча проглотил ошибку загрузки
 * чанка) — восстанавливаемся тем же путём, что и при явной ошибке.
 */
export function recoverStalledRoute() {
  recover();
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

  // Сторож запуска: часть ошибок загрузки кода роутер проглатывает молча,
  // и экран просто остаётся пустым. Если за BOOT_TIMEOUT_MS приложение
  // не отрисовалось — восстанавливаемся тем же путём.
  bootTimer = setTimeout(() => {
    bootTimer = null;
    if (!appLoaded) recover();
  }, BOOT_TIMEOUT_MS);
}
