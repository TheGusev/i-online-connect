import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authApi } from "@/api";
import { useSessionStore } from "@/store/useSessionStore";
import { cleanupLogoutState } from "./logout-cleanup.mjs";

export function useLogin() {
  const setSession = useSessionStore((state) => state.setSession);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (session) => setSession(session),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const clearSession = useSessionStore((state) => state.clearSession);
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => cleanupLogoutState({
      clearSession,
      cancelQueries: () => queryClient.cancelQueries(),
      clearCache: () => queryClient.clear(),
    }),
  });
}
