import { useMutation } from "@tanstack/react-query";

import { authApi } from "@/api";
import { useSessionStore } from "@/store/useSessionStore";

export function useLogin() {
  const setSession = useSessionStore((state) => state.setSession);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (session) => setSession(session),
  });
}

export function useLogout() {
  const clearSession = useSessionStore((state) => state.clearSession);
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => clearSession(),
  });
}
