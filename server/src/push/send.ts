/**
 * Отправка push-уведомлений на устройства пользователя (Web Push + VAPID).
 *
 * Без сторонних сервисов: web-push обращается напрямую к push-серверу браузера
 * (FCM/Mozilla/Apple) по стандарту. Ключи VAPID берутся из окружения; если их
 * нет — функция ничего не делает и один раз пишет предупреждение в лог, чтобы
 * сервер работал как обычно.
 *
 * Ошибки никогда не пробрасываются наружу: пуш — дополнение к записи в
 * notifications, а не условие успешного запроса.
 */
import webpush from "web-push";

import { query } from "../db.ts";
import { env } from "../env.ts";

export interface PushPayload {
  title: string;
  body?: string;
  /** Куда ведёт тап по уведомлению, например `/chat/<id>`. */
  url?: string;
  /** Схлопывание однотипных уведомлений на устройстве. */
  tag?: string;
}

let configured = false;
let warned = false;

function ensureConfigured(): boolean {
  if (!env.pushEnabled) {
    if (!warned) {
      warned = true;
      console.warn(
        "[push] VAPID-ключи не заданы — push-уведомления выключены. " +
          "См. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT в .env.",
      );
    }
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Разослать уведомление на все устройства пользователя. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const subscriptions = await query<SubscriptionRow>(
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [userId],
    );
    if (subscriptions.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url ?? "/",
      tag: payload.tag ?? "ya-online",
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            { TTL: 3600 },
          );
          await query("UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1", [
            subscription.id,
          ]);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // 404/410 — устройство отписалось или подписка истекла: чистим.
          if (status === 404 || status === 410) {
            await query("DELETE FROM push_subscriptions WHERE id = $1", [subscription.id]);
            return;
          }
          console.error(`[push] отправка не удалась (${String(status ?? "?")})`, error);
        }
      }),
    );
  } catch (error) {
    console.error("[push] рассылка", error);
  }
}

/** Разослать нескольким пользователям (например участникам сообщества). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.all([...new Set(userIds)].map((userId) => sendPushToUser(userId, payload)));
}
