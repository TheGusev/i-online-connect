/**
 * Подбор получателей уведомления о новом объявлении.
 *
 * Правило: тот же город (без учёта регистра), в user_needs отмечена категория
 * объявления, включён тумблер notification_prefs.listings, нет взаимных
 * блокировок, аккаунт не удалён и не на паузе. Автор себя не получает.
 *
 * Доставка: запись в notifications + WebSocket, если человек онлайн. Иначе
 * уведомление ждёт в таблице (покажется при следующем заходе), а на почту
 * уходит короткое письмо — без деталей объявления и без чужих контактов.
 */
import { query } from "../db.ts";
import { sendMail } from "../mail/smtp.ts";
import { isUserOnline, publishUserEvent } from "../ws/notifications.ts";

interface Recipient {
  user_id: string;
  email: string;
  name: string | null;
}

export interface ListingNotificationInput {
  listingId: string;
  authorId: string;
  authorName: string;
  category: string;
  city: string;
  title: string;
  priceMinor: number | null;
}

export async function notifyListingMatches(input: ListingNotificationInput): Promise<number> {
  const recipients = await query<Recipient>(
    `SELECT u.id AS user_id, u.email, p.name
       FROM user_needs n
       JOIN users u    ON u.id = n.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE n.category = $1::need_category
        AND u.id <> $2
        AND u.deleted_at IS NULL
        AND lower(p.city) = lower($3)
        AND COALESCE(np.listings, true) = true
        AND NOT EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.user_id = u.id AND b.blocked_id = $2)
                  OR (b.user_id = $2 AND b.blocked_id = u.id)
            )
      LIMIT 500`,
    [input.category, input.authorId, input.city],
  );

  if (recipients.length === 0) return 0;

  const payload = {
    listingId: input.listingId,
    category: input.category,
    city: input.city,
    title: input.title,
    priceMinor: input.priceMinor,
    authorId: input.authorId,
    authorName: input.authorName,
  };

  for (const recipient of recipients) {
    // ON CONFLICT — по уникальному индексу (user_id, kind, payload->>'listingId').
    const rows = await query<{ id: string; created_at: Date }>(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, 'listing_match', $2::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING id, created_at`,
      [recipient.user_id, JSON.stringify(payload)],
    );
    const row = rows[0];
    if (!row) continue;

    const notification = {
      id: row.id,
      kind: "listing_match" as const,
      payload,
      readAt: null,
      createdAt: row.created_at.toISOString(),
    };

    if (isUserOnline(recipient.user_id)) {
      publishUserEvent(recipient.user_id, { type: "notification", notification });
      continue;
    }

    // Офлайн — мягкое письмо-напоминание. Ошибка почты не должна ронять
    // публикацию объявления.
    try {
      const greeting = recipient.name ? `${recipient.name}, привет!` : "Привет!";
      await sendMail({
        to: recipient.email,
        subject: "Рядом появилось подходящее объявление",
        text: `${greeting}\n\nВ вашем городе кто-то разместил объявление по теме, которую вы отметили.\nЗаходите в «Я Онлайн» → раздел «Рядом», чтобы посмотреть и откликнуться.\n\nОтключить такие письма можно в настройках уведомлений.`,
      });
    } catch (error) {
      console.error("[listings] не удалось отправить письмо", error);
    }
  }

  return recipients.length;
}
