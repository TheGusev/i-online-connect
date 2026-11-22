import { query } from "../db.ts";
import { getNotificationActivitySnapshot } from "./activity.ts";

interface ChatAction {
  conversationId: string;
  messageId: string;
}

let lastWarningAt = 0;

/**
 * Только для подтверждённых сообщений из маршрутов личного чата.
 * Используем время исходного сообщения: повторная доставка не создаёт
 * новую активную минуту.
 */
async function recordChatAction(userId: string, action: ChatAction): Promise<void> {
  await query(
    `INSERT INTO notification_activity_slots
       (user_id, slot, last_action_at)
     SELECT m.author_id,
            ((floor(extract(epoch FROM m.created_at) / 60)::bigint % 64))::smallint,
            m.created_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN users u ON u.id = m.author_id
       JOIN profiles p ON p.user_id = m.author_id
      WHERE m.id = $1
        AND m.conversation_id = $2
        AND m.author_id = $3
        AND m.deleted_at IS NULL
        AND c.notes_owner_id IS NULL
        AND u.deleted_at IS NULL
        AND p.is_seed = false
        AND m.created_at > statement_timestamp() - interval '60 minutes'
        AND m.created_at <= statement_timestamp()
        AND EXISTS (
          SELECT 1
            FROM conversation_participants cp
            JOIN users peer ON peer.id = cp.user_id
            JOIN profiles pp ON pp.user_id = cp.user_id
           WHERE cp.conversation_id = m.conversation_id
             AND cp.user_id <> m.author_id
             AND peer.deleted_at IS NULL
             AND pp.is_seed = false
        )
     ON CONFLICT (user_id, slot) DO UPDATE
       SET last_action_at = GREATEST(
         notification_activity_slots.last_action_at,
         EXCLUDED.last_action_at
       )`,
    [action.messageId, action.conversationId, userId],
  );
}

/**
 * Сбой необязательной метрики не прерывает доставку уведомления.
 * При ошибке снимок отсутствует, а не подменяется выдуманным уровнем.
 */
export async function captureNotificationActorActivity(
  actorId: string | null | undefined,
  chatAction?: ChatAction,
) {
  if (!actorId) return null;

  try {
    if (chatAction) await recordChatAction(actorId, chatAction);
    return await getNotificationActivitySnapshot(actorId);
  } catch {
    const now = Date.now();
    if (now - lastWarningAt >= 60_000) {
      lastWarningAt = now;
      console.warn(
        "[notification-activity] Снимок активности недоступен; уведомление доставляется без него",
      );
    }
    return null;
  }
}
