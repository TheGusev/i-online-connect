import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { pushApi } from "@/api";
import { useSessionStore } from "@/store/useSessionStore";

/**
 * Push-уведомления на устройство (Web Push + VAPID).
 *
 * Состояния:
 * - `unsupported`  — браузер не умеет push (или мы на сервере при SSR);
 * - `needs-install` — iOS Safari: пуши работают только у сайта, добавленного
 *   на экран «Домой» (iOS 16.4+). Это ограничение Apple;
 * - `unavailable`  — сервер без VAPID-ключей, отправка выключена;
 * - `denied`       — пользователь запретил уведомления в браузере;
 * - `off` / `on`   — подписки нет / есть.
 */
export type PushState = "loading" | "unsupported" | "needs-install" | "unavailable" | "denied" | "off" | "on";

const SW_URL = "/sw.js";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  return iOS;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Регистрация service worker: без него пуши не приходят. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const secure = window.isSecureContext || window.location.hostname === "localhost";
  if (!secure) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL);
  } catch (error) {
    console.error("[push] service worker не зарегистрирован", error);
    return null;
  }
}

export function usePushSubscription() {
  const authed = useSessionStore((state) => state.status === "authed");
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const detect = useCallback(async () => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      setState(isIosSafari() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (isIosSafari() && !isStandalone()) {
      setState("needs-install");
      return;
    }
    if (!authed) {
      setState("off");
      return;
    }

    try {
      const key = await pushApi.getPushPublicKey();
      if (!key.enabled || !key.publicKey) {
        setState("unavailable");
        return;
      }
    } catch {
      setState("unavailable");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    const registration = await ensureServiceWorker();
    const existing = await registration?.pushManager.getSubscription();
    setState(existing ? "on" : "off");
  }, [authed]);

  useEffect(() => {
    void detect();
  }, [detect]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await ensureServiceWorker();
      if (!registration) {
        setState("unsupported");
        return;
      }
      const { publicKey, enabled } = await pushApi.getPushPublicKey();
      if (!enabled || !publicKey) {
        setState("unavailable");
        return;
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      await pushApi.subscribePush(subscription.toJSON());
      setState("on");
      toast.success("Уведомления на устройство включены");
    } catch (error) {
      console.error("[push] не удалось включить", error);
      toast.error("Не удалось включить уведомления на этом устройстве");
      await detect();
    } finally {
      setBusy(false);
    }
  }, [detect]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await ensureServiceWorker();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribePush(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (error) {
      console.error("[push] не удалось отключить", error);
      toast.error("Не удалось отключить уведомления");
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    toggle: (next: boolean) => (next ? enable() : disable()),
  };
}
