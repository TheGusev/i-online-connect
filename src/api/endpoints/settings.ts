import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type {
  AccountSettings,
  DeleteAccountReceipt,
  DeleteAccountRequest,
  NotificationSettings,
  PasswordChange,
  SettingsBundle,
} from "../types";

export async function getSettings(): Promise<SettingsBundle> {
  return USE_MOCK ? mockApi.settings() : request<SettingsBundle>("/settings");
}

export async function updateAccount(patch: Partial<AccountSettings>): Promise<AccountSettings> {
  return USE_MOCK
    ? mockApi.updateAccount(patch)
    : request<AccountSettings>("/settings/account", { method: "PATCH", body: patch });
}

export async function updateNotifications(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  return USE_MOCK
    ? mockApi.updateNotifications(patch)
    : request<NotificationSettings>("/settings/notifications", { method: "PATCH", body: patch });
}

/** Смена пароля. Проверка текущего пароля — на backend. */
export async function changePassword(payload: PasswordChange): Promise<{ ok: true }> {
  return USE_MOCK
    ? mockApi.changePassword(payload)
    : request<{ ok: true }>("/settings/password", { method: "POST", body: payload });
}

/** Удаление аккаунта: причина опциональна, восстановление возможно ограниченное время. */
export async function deleteAccount(payload: DeleteAccountRequest): Promise<DeleteAccountReceipt> {
  return USE_MOCK
    ? mockApi.deleteAccount(payload)
    : request<DeleteAccountReceipt>("/settings/account", { method: "DELETE", body: payload });
}
