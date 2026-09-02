import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  settingsApi,
  type AccountSettings,
  type DeleteAccountRequest,
  type NotificationSettings,
  type PasswordChange,
  type SettingsBundle,
} from "@/api";

const settingsKey = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: settingsApi.getSettings });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AccountSettings>) => settingsApi.updateAccount(patch),
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
  return useMutation({
    mutationFn: (payload: DeleteAccountRequest) => settingsApi.deleteAccount(payload),
  });
}
