import type { NotificationFeed } from "../types";
import { request } from "../client";

/** Список in-app уведомлений (совпадения и отклики по объявлениям). */
export async function getNotifications(
  params: { unread?: boolean; limit?: number } = {},
): Promise<NotificationFeed> {
  return request<NotificationFeed>("/notifications", { query: params });
}

/** Без ids помечает прочитанными все. */
export async function markNotificationsRead(ids?: string[]): Promise<{ ok: true }> {
  return request<{ ok: true }>("/notifications/read", {
    method: "POST",
    body: ids ? { ids } : {},
  });
}
