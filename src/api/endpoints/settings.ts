import { request } from "../client";
import type {
  AccountSettings,
  DeleteAccountReceipt,
  DeleteAccountRequest,
  NotificationSettings,
  PasswordChange,
  SettingsBundle,
} from "../types";

export async function getSettings(): Promise<SettingsBundle> {
  return request<SettingsBundle>("/settings");
}

export async function updateAccount(patch: Partial<AccountSettings>): Promise<AccountSettings> {
  return request<AccountSettings>("/settings/account", { method: "PATCH", body: patch });
}

export async function updateNotifications(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  return request<NotificationSettings>("/settings/notifications", { method: "PATCH", body: patch });
}

/** Смена пароля. Проверка текущего пароля — на backend. */
export async function changePassword(payload: PasswordChange): Promise<{ ok: true }> {
  return request<{ ok: true }>("/settings/password", { method: "POST", body: payload });
}

/** Удаление аккаунта: причина опциональна, восстановление возможно ограниченное время. */
export async function deleteAccount(payload: DeleteAccountRequest): Promise<DeleteAccountReceipt> {
  return request<DeleteAccountReceipt>("/settings/account", { method: "DELETE", body: payload });
}
