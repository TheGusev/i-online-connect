import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  settingsApi,
  type AccountPatch,
  type DeleteAccountRequest,
  type NotificationSettings,
  type PasswordChange,
  type SettingsBundle,
} from "@/api";
import { getSessionRevision, isSessionCurrent, setToken } from "@/api/client";
import { useSessionStore } from "@/store/useSessionStore";
import { cleanupLogoutState } from "@/features/auth/logout-cleanup.mjs";

const settingsKey = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: settingsApi.getSettings });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AccountPatch) => settingsApi.updateAccount(patch),
    onSuccess: (account) => {
      queryClient.setQueryData(settingsKey, (prev: SettingsBundle | undefined) =>
        prev ? { ...prev, account } : prev,
      );
    },
  });
}

export function useUpdateNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationSettings>) => settingsApi.updateNotifications(patch),
    onSuccess: (notifications) => {
      queryClient.setQueryData(settingsKey, (prev: SettingsBundle | undefined) =>
        prev ? { ...prev, notifications } : prev,
      );
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: PasswordChange) => settingsApi.changePassword(payload),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const clearSession = useSessionStore(state => state.clearSession);
  return useMutation({
    mutationFn: async (payload: DeleteAccountRequest) => {
      const revision = getSessionRevision();
      const receipt = await settingsApi.deleteAccount(payload);
      if (!isSessionCurrent(revision)) return receipt;
      setToken(null);
      const clearedRevision = getSessionRevision();
      try {
        await cleanupLogoutState({
          clearSession,
          cancelQueries: () => queryClient.cancelQueries(),
          clearCache: () => queryClient.clear(),
          isCurrent: () => isSessionCurrent(clearedRevision),
        });
      } catch {
        console.warn("[account] очистка после подтверждённого удаления завершилась с ошибкой");
      }
      return receipt;
    },
  });
}
