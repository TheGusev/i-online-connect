import { useCallback, useEffect, useRef } from "react";
import { Navigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PersonalInviteBridge } from "@/features/chat/PersonalInviteBridge";
import { ApiError, RESUME_EVENT, SESSION_INVALID_EVENT, authApi, ensureFreshToken, getToken, setToken } from "@/api";
import { getSessionRevision, isSessionCurrent } from "@/api/client";
import { Button } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";
import { needsFirstEntry } from "./first-entry";
import { ShortEntry } from "./ShortEntry";
function isInvalidSession(cause: unknown) {
  return cause instanceof ApiError && (cause.status === 401 || cause.status === 403);
}
let restoreRequest: (() => void) | null = null;
export function retrySessionRestore() { restoreRequest?.(); }

export function SessionRestore() {
  const queryClient = useQueryClient();
  const setUser = useSessionStore(state => state.setUser);
  const setStatus = useSessionStore(state => state.setStatus);
  const clearSession = useSessionStore(state => state.clearSession);
  const lifetime = useRef(0);
  const confirmedRevision = useRef<number | null>(null);
  const inFlight = useRef<{ revision: number } | null>(null);
  const restore = useCallback(() => {
    const token = getToken();
    if (!token) { clearSession(); return; }
    const revision = getSessionRevision();
    const mount = lifetime.current;
    const current = () => lifetime.current === mount && isSessionCurrent(revision);
    if (inFlight.current?.revision === revision) return;
    const ticket = { revision }; inFlight.current = ticket;
    const state = useSessionStore.getState();
    if (state.token !== token && confirmedRevision.current !== revision) {
      queryClient.clear();
      useSessionStore.setState({ user: null, token, status: "loading" });
    }
    else if (state.status !== "authed") setStatus("loading");
    authApi.getCurrentUser().then(user => {
      if (!current()) return;
      confirmedRevision.current = revision;
      useSessionStore.setState({ token: getToken() }); setUser(user);
    }).catch((cause: unknown) => {
      if (!current()) return;
      if (isInvalidSession(cause) || !getToken()) {
        console.error("[auth] сессия недействительна:", cause);
        setToken(null); clearSession();
        window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
      } else {
        console.warn("[auth] нет связи, сессию сохраняем:", cause); setStatus("offline");
      }
    }).finally(() => {
      if (inFlight.current === ticket) inFlight.current = null;
    });
  }, [clearSession, queryClient, setStatus, setUser]);
  useEffect(() => {
    const mount = lifetime.current;
    restoreRequest = restore; restore();
    const onInvalid = () => {
      const revision = getSessionRevision();
      clearSession();
      void queryClient.cancelQueries().catch(() => {
        console.warn("[auth] не удалось отменить запросы недействительной сессии");
      }).finally(() => {
        if (lifetime.current === mount && isSessionCurrent(revision)) queryClient.clear();
      });
    };
    let resuming = false;
    const onResume = async () => {
      if (document.visibilityState !== "visible" || resuming) return;
      if (!getToken()) { onInvalid(); return; }
      const revision = getSessionRevision();
      const current = () => lifetime.current === mount && isSessionCurrent(revision);
      resuming = true;
      try {
        const state = useSessionStore.getState();
        if (state.status === "authed" && state.token === getToken()) confirmedRevision.current = revision;
        if (state.status === "offline" || state.status === "loading" ||
          (state.token !== getToken() && confirmedRevision.current !== revision)) { restore(); return; }
        const result = await ensureFreshToken();
        if (!current() || result?.kind === "invalid" || result?.kind === "stale" || !getToken()) return;
        useSessionStore.setState({ token: getToken() });
        await queryClient.refetchQueries({ type: "active" });
        if (current()) window.dispatchEvent(new Event(RESUME_EVENT));
      } catch (cause) {
        if (current()) console.warn("[auth] восстановление после возврата:", cause);
      } finally { resuming = false; }
    };
    window.addEventListener(SESSION_INVALID_EVENT, onInvalid);
    document.addEventListener("visibilitychange", onResume); window.addEventListener("online", onResume);
    return () => {
      lifetime.current += 1; inFlight.current = null;
      if (restoreRequest === restore) restoreRequest = null;
      window.removeEventListener(SESSION_INVALID_EVENT, onInvalid);
      document.removeEventListener("visibilitychange", onResume); window.removeEventListener("online", onResume);
    };
  }, [clearSession, queryClient, restore]);
  return <PersonalInviteBridge />;
}
export function useSession() {
  return useSessionStore(state => ({ user: state.user, status: state.status, isAuthenticated: state.status === "authed" }));
}
export function SessionLoading() {
  return <div className="grid min-h-dvh place-items-center bg-background"><span className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
}
export function SessionOffline() {
  return <div className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground"><div className="space-y-4"><span className="mx-auto block size-8 animate-spin rounded-full border-2 border-border border-t-primary" /><p className="text-sm text-muted-foreground">Нет связи, пробуем снова…</p><Button variant="secondary" size="sm" onClick={retrySessionRestore}>Повторить</Button></div></div>;
}
export function RequireSession({ children }: { children: React.ReactNode }) {
  const status = useSessionStore(state => state.status);
  const user = useSessionStore(state => state.user);
  if (status === "loading") return <SessionLoading />;
  if (status === "offline") return <SessionOffline />;
  if (status === "guest") return <Navigate to="/auth" replace />;
  if (needsFirstEntry(user)) return <ShortEntry />;
  return <>{children}</>;
}
