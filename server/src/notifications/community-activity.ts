import { query } from "../db.ts";

type CommunityAction = "space_message" | "space_post" | "space_comment";

let lastWarningAt = 0;

/** Вызывать после успешного сохранения и завершения транзакции. */
export async function recordCommunityNotificationActivity(
  userId: string,
  source: CommunityAction,
  recordId: unknown,
): Promise<void> {
  if (typeof recordId !== "string") return;

  try {
    let sourceSql: string;

    switch (source) {
      case "space_message":
        sourceSql =
          "SELECT author_id, created_at FROM space_messages WHERE id = $1 AND deleted_at IS NULL";
        break;
      case "space_post":
        sourceSql =
          "SELECT author_id, created_at FROM space_posts WHERE id = $1";
        break;
      case "space_comment":
        sourceSql =
          "SELECT author_id, created_at FROM space_post_comments WHERE id = $1 AND deleted_at IS NULL";
        break;
      default:
        throw new Error("Unsupported community activity source");
    }

    // В SQL вставляется только одна из фиксированных строк выше.
    // Все пользовательские идентификаторы остаются параметрами.
    await query(
      `INSERT INTO notification_activity_slots
         (user_id, slot, last_action_at)
       SELECT action.author_id,
              ((floor(extract(epoch FROM action.created_at) / 60)::bigint % 64))::smallint,
              action.created_at
         FROM (${sourceSql}) AS action
         JOIN users u ON u.id = action.author_id
         JOIN profiles p ON p.user_id = action.author_id
        WHERE action.author_id = $2
          AND u.deleted_at IS NULL
          AND p.is_seed = false
          AND action.created_at > statement_timestamp() - interval '60 minutes'
          AND action.created_at <= statement_timestamp()
       ON CONFLICT (user_id, slot) DO UPDATE
         SET last_action_at = GREATEST(
           notification_activity_slots.last_action_at,
           EXCLUDED.last_action_at
         )`,
      [recordId, userId],
    );
  } catch {
    const now = Date.now();
    if (now - lastWarningAt >= 60_000) {
      lastWarningAt = now;
      console.warn(
        "[notification-activity] Активность сообщества не записана; основное действие сохранено",
      );
    }
  }
}
