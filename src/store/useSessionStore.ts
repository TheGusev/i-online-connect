import { create } from "zustand";

import type { Session, User } from "@/api";

/**
 * loading — токен есть, профиль ещё запрашивается;
 * authed  — сессия подтверждена backend'ом;
 * guest   — токена нет либо он больше не действует.
 */
export type SessionStatus = "loading" | "authed" | "guest";

interface SessionState {
  user: User | null;
  token: string | null;
  status: SessionStatus;
  setSession: (session: Session) => void;
  setUser: (user: User) => void;
  setStatus: (status: SessionStatus) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  token: null,
  status: "loading",
  setSession: (session) => set({ user: session.user, token: session.token, status: "authed" }),
  setUser: (user) => set({ user, status: "authed" }),
  setStatus: (status) => set({ status }),
  clearSession: () => set({ user: null, token: null, status: "guest" }),
}));
