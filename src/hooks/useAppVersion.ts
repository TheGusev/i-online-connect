import { useCallback, useEffect, useRef, useState } from "react";

import { keepSplash } from "@/lib/splash";

/**
 * Обновление открытых вкладок и установленного PWA.
 *
 * Версия сборки лежит в двух местах:
 *   - /version.json (создаётся scripts/build-static.mjs) — что сейчас на сервере;
 *   - <meta name="app-version"> в index.html — из какой сборки открыт этот документ.
 *
 * Если документ старый (вебвью открыл закешированный index.html после деплоя),
 * его чанки с сервера уже удалены — тогда молча перезагружаемся один раз, не
 * дожидаясь белого экрана. Если документ актуальный, а на сервере появилась
 * новая версия — показываем неблокирующий баннер: пользователь может писать
 * сообщение, решать ему.
 */
const CHECK_INTERVAL_MS = 3 * 60 * 1000;
const STALE_RELOAD_FLAG = "ya-online:stale-document-reload";

function documentVersion(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector('meta[name="app-version"]');
  const value = meta?.getAttribute("content")?.trim();
  return value && value !== "__APP_VERSION__" ? value : null;
}

async function hardReload() {
  // Пока идёт перезагрузка — держим фирменный экран загрузки, а не пустоту.
  keepSplash();
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // Service worker не обязателен для обновления.
  }
  window.location.reload();
}

export function useAppVersion() {
  const knownVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/version.json", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { version?: unknown };
      const version = typeof data.version === "string" ? data.version : null;
      if (!version) return;

      if (knownVersion.current === null) {
        knownVersion.current = version;
        const loaded = documentVersion();
        // Документ из другой (старой) сборки: его чанков на сервере уже нет.
        if (loaded && loaded !== version) {
          let tried = false;
          try {
            tried = sessionStorage.getItem(STALE_RELOAD_FLAG) === "1";
            sessionStorage.setItem(STALE_RELOAD_FLAG, "1");
          } catch {
            tried = false;
          }
          if (!tried) {
            void hardReload();
            return;
          }
          // Перезагрузка не помогла (например, сервер отдаёт старый HTML) —
          // не зацикливаемся, а показываем баннер с ручной кнопкой.
          setUpdateAvailable(true);
          return;
        }
        // Документ совпал с сервером — снимаем флаг аварийной перезагрузки.
        try {
          sessionStorage.removeItem(STALE_RELOAD_FLAG);
        } catch {
          // ignore
        }
        return;
      }

      if (knownVersion.current !== version) setUpdateAvailable(true);
    } catch {
      // Нет сети или файла (dev-режим) — молча пропускаем.
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  return {
    updateAvailable,
    dismiss: () => setUpdateAvailable(false),
    applyUpdate: () => void hardReload(),
  };
}
