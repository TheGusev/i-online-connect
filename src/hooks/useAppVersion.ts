import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Мягкое обновление открытых вкладок.
 *
 * Версия сборки лежит в /version.json (создаётся scripts/build-static.mjs).
 * Первая успешная загрузка запоминается в памяти вкладки; далее раз в 3 минуты
 * (и при возврате во вкладку) файл перечитывается без кеша. Если версия
 * изменилась — поднимаем флаг, но НЕ перезагружаем страницу сами: пользователь
 * может писать сообщение или заполнять форму.
 */
const CHECK_INTERVAL_MS = 3 * 60 * 1000;

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
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  return { updateAvailable, dismiss: () => setUpdateAvailable(false) };
}
