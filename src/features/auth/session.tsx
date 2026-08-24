import { useEffect } from "react";
import { Navigate } from "@tanstack/react-router";

import { authApi, getToken, setToken } from "@/api";
import { useSessionStore } from "@/store/useSessionStore";

/**
 * Восстановление сессии при загрузке приложения: если в localStorage лежит
 * access-токен, спрашиваем у backend, кто мы. Пока идёт запрос — статус
 * loading, чтобы приватные экраны не мигали редиректом на вход.
 */
export function SessionRestore() {
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const clearSession = useSessionStore((state) => state.clearSession);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      clearSession();
      return;
    }
    let cancelled = false;
    setStatus("loading");
    authApi
      .getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        useSessionStore.setState({ token });
        setUser(user);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        console.error("[auth] сессию восстановить не удалось:", cause);
        setToken(null);
        clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession, setStatus, setUser]);

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

/** Гейт приватных экранов: без сессии уводим на вход. */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const status = useSessionStore((state) => state.status);
  if (status === "loading") return <SessionLoading />;
  if (status === "guest") return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
