import { useCallback, useEffect, useRef } from "react";
import { Navigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  RESUME_EVENT,
  SESSION_INVALID_EVENT,
  authApi,
  ensureFreshToken,
  getToken,
  setToken,
} from "@/api";
import { Button } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

/** Ошибка, после которой сессию можно считать недействительной. */
function isInvalidSession(cause: unknown) {
  return cause instanceof ApiError && (cause.status === 401 || cause.status === 403);
}

let restoreRequest: (() => void) | null = null;
/** Повторить восстановление сессии (кнопка на экране «Нет связи»). */
export function retrySessionRestore() {
  restoreRequest?.();
}

/**
 * Восстановление сессии при загрузке приложения и при возврате в него.
 * Временная ошибка сети не выкидывает из аккаунта: статус offline и повтор
 * при событиях online / возврате во вкладку.
 */
export function SessionRestore() {
  const queryClient = useQueryClient();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const clearSession = useSessionStore((state) => state.clearSession);
  const inFlight = useRef(false);

  const restore = useCallback(() => {
    const token = getToken();
    if (!token) {
      clearSession();
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    if (useSessionStore.getState().status !== "authed") setStatus("loading");
    authApi
      .getCurrentUser()
      .then((user) => {
        useSessionStore.setState({ token: getToken() });
        setUser(user);
      })
      .catch((cause: unknown) => {
        if (isInvalidSession(cause) || !getToken()) {
          console.error("[auth] сессия недействительна:", cause);
          setToken(null);
          clearSession();
        } else {
          console.warn("[auth] нет связи, сессию сохраняем:", cause);
          setStatus("offline");
        }
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [clearSession, setStatus, setUser]);

  useEffect(() => {
    restoreRequest = restore;
    restore();

    const onInvalid = () => clearSession();

    let resuming = false;
    const onResume = async () => {
      if (document.visibilityState !== "visible" || resuming || !getToken()) return;
      resuming = true;
      try {
        const status = useSessionStore.getState().status;
        if (status === "offline" || status === "loading") {
          restore();
          return;
        }
        const result = await ensureFreshToken();
        if (result?.kind === "invalid" || !getToken()) return;
        useSessionStore.setState({ token: getToken() });
        await queryClient.refetchQueries({ type: "active" });
        window.dispatchEvent(new Event(RESUME_EVENT));
      } finally {
        resuming = false;
      }
    };

    window.addEventListener(SESSION_INVALID_EVENT, onInvalid);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    return () => {
      restoreRequest = null;
      window.removeEventListener(SESSION_INVALID_EVENT, onInvalid);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [clearSession, queryClient, restore]);

  return null;
}

export function useSession() {
  return useSessionStore((state) => ({
    user: state.user,
    status: state.status,
    isAuthenticated: state.status === "authed",
  }));
}

/** Заглушка на время проверки токена: без неё приватный экран мигает. */
export function SessionLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <span className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

/** Сервер недоступен, но сессия цела: ждём связь и пробуем снова. */
export function SessionOffline() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground">
      <div className="space-y-4">
        <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm text-muted-foreground">Нет связи, пробуем снова…</p>
        <Button variant="secondary" size="sm" onClick={retrySessionRestore}>
          Повторить
        </Button>
      </div>
    </div>
  );
}

/** Гейт приватных экранов: без сессии уводим на вход. */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const status = useSessionStore((state) => state.status);
  if (status === "loading") return <SessionLoading />;
  if (status === "offline") return <SessionOffline />;
  if (status === "guest") return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
