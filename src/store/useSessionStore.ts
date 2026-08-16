import { create } from "zustand";

import type { Session, User } from "@/api";

interface SessionState {
  user: User | null;
  token: string | null;
  setSession: (session: Session) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  token: null,
  setSession: (session) => set({ user: session.user, token: session.token }),
  clearSession: () => set({ user: null, token: null }),
}));
