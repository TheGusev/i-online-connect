import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<unknown> };
const KEY = "ya-online.install-dismissed";
const WEEK = 7 * 24 * 3600 * 1000;
const ua = () => navigator.userAgent;
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
const ios = () =>
  /iphone|ipad|ipod/i.test(ua()) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const inApp = () => /FBAN|FBAV|Instagram|Telegram|VKAndroidApp|VK\/|WhatsApp|Line\/|; wv\)/i.test(ua());

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<"none" | "ios" | "inapp">("none");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (standalone()) return;
    try {
      if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < WEEK) return;
    } catch {
      /* хранилище недоступно */
    }
    setMode(inApp() ? "inapp" : ios() ? "ios" : "none");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const close = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible || (!event && mode === "none")) return null;
  return (
    <div role="dialog" aria-label="Установка приложения"
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-border bg-card p-4 text-foreground shadow-lg">
      <p className="font-semibold">Установите «Я Онлайн» на телефон</p>
      {event ? (
        <button type="button"
          className="mt-3 w-full rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground"
          onClick={async () => {
            try { await event.prompt(); } finally { setEvent(null); close(); }
          }}>
          Установить приложение
        </button>
      ) : mode === "inapp" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Откройте ссылку в Safari или Chrome (меню «⋯» → «Открыть в браузере»), чтобы установить приложение.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Нажмите «Поделиться» внизу Safari, затем «На экран «Домой»».
        </p>
      )}
      <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={close}>
        Не сейчас
      </button>
    </div>
  );
}
