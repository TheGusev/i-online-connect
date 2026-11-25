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
export type PushState = "loading" | "unsupported" | "needs-install" | "unavailable" | "denied" | "prompt" | "off" | "on";

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

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
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

const SYNC_KEY = "ya-push-synced-at";
const SYNC_TTL_MS = 10 * 60 * 1000;

function sameKey(current: ArrayBuffer | null | undefined, expected: ArrayBuffer): boolean {
  if (!current || current.byteLength !== expected.byteLength) return false;
  const a = new Uint8Array(current);
  const b = new Uint8Array(expected);
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Разрешение уже выдано: тихо создаём/чиним подписку и синхронизируем её с сервером. */
async function syncSubscription(publicKey: string): Promise<boolean> {
  const registration = await ensureServiceWorker();
  if (!registration) return false;
  await navigator.serviceWorker.ready;
  const expected = urlBase64ToUint8Array(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  let created = false;
  if (subscription && !sameKey(subscription.options?.applicationServerKey, expected)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expected,
    });
    created = true;
  }
  const last = Number(window.sessionStorage.getItem(SYNC_KEY) ?? "0");
  if (created || Date.now() - last > SYNC_TTL_MS) {
    await pushApi.subscribePush(subscription.toJSON());
    window.sessionStorage.setItem(SYNC_KEY, String(Date.now()));
  }
  return true;
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
    if (Notification.permission === "default") {
      setState("prompt");
      return;
    }

    try {
      const { publicKey } = await pushApi.getPushPublicKey();
      const ok = await syncSubscription(publicKey);
      setState(ok ? "on" : "unsupported");
    } catch (error) {
      console.error("[push] автоподписка не удалась", error);
      setState("off");
    }
  }, [authed]);

  useEffect(() => {
    void detect();
    const refresh = () => void detect();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
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
        await pushApi.unsubscribePush(subscription.endpoint);
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
    refresh: detect,
    toggle: (next: boolean) => (next ? enable() : disable()),
  };
}
