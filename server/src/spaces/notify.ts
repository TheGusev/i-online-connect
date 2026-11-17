import { query, queryOne } from "../db.ts";
import { sendPushToUsers } from "../push/send.ts";
import { publishUserEvent } from "../ws/notifications.ts";

interface SpacePush {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Уведомления о событиях сообщества: запись в таблицу (для тех, кто офлайн),
 * доставка по сокету и push тем, у кого включён канал «Spaces».
 */
export async function notifySpaceUsers(
  userIds: string[],
  kind: string,
  payload: Record<string, unknown>,
  push?: SpacePush | undefined,
): Promise<void> {
  const delivered: string[] = [];
  for (const userId of userIds) {
    const row = await queryOne<{ id: string; created_at: Date }>(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, $2, $3::jsonb) RETURNING id, created_at`,
      [userId, kind, JSON.stringify(payload)],
    );
    if (!row) continue;
    publishUserEvent(userId, {
      type: "notification",
      notification: {
        id: row.id,
        kind,
        payload,
        readAt: null,
        createdAt: row.created_at.toISOString(),
      },
    });
    delivered.push(userId);
  }
  if (!push || delivered.length === 0) return;
  const allowed = await query<{ id: string }>(
    `SELECT u.id
       FROM unnest($1::uuid[]) AS u(id)
       LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE COALESCE(np.spaces, true)`,
    [delivered],
  );
  if (allowed.length > 0) await sendPushToUsers(allowed.map((row) => row.id), push);
}
