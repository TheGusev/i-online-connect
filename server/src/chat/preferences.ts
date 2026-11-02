import { transaction } from "../db.ts";
import { badRequest, forbidden } from "../http.ts";

export const MAX_PINNED_CHATS = 5;

export async function setConversationPreference(userId: string, conversationId: string, kind: "pin" | "favorite", enabled: boolean) {
  return transaction(async (client) => {
    // Serialize all preference writes for one user, including concurrent pins.
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const membership = await client.query("SELECT 1 FROM conversation_participants WHERE user_id = $1 AND conversation_id = $2 FOR UPDATE", [userId, conversationId]);
    if (!membership.rowCount) throw forbidden("Нет доступа к диалогу");
    if (kind === "pin" && enabled) {
      const current = await client.query("SELECT pinned_at FROM conversation_preferences WHERE user_id = $1 AND conversation_id = $2", [userId, conversationId]);
      if (!current.rows[0]?.pinned_at) {
        const count = await client.query("SELECT count(*)::int AS count FROM conversation_preferences WHERE user_id = $1 AND pinned_at IS NOT NULL", [userId]);
        if (count.rows[0].count >= MAX_PINNED_CHATS) throw badRequest("Можно закрепить не больше 5 чатов");
      }
    }
    const result = kind === "pin"
      ? await client.query(`INSERT INTO conversation_preferences(user_id, conversation_id, pinned_at)
          VALUES($1, $2, CASE WHEN $3 THEN clock_timestamp() ELSE NULL END)
          ON CONFLICT(user_id, conversation_id) DO UPDATE
          SET pinned_at = CASE WHEN $3 THEN COALESCE(conversation_preferences.pinned_at, clock_timestamp()) ELSE NULL END
          RETURNING pinned_at, is_favorite`, [userId, conversationId, enabled])
      : await client.query(`INSERT INTO conversation_preferences(user_id, conversation_id, is_favorite)
          VALUES($1, $2, $3) ON CONFLICT(user_id, conversation_id) DO UPDATE SET is_favorite = $3
          RETURNING pinned_at, is_favorite`, [userId, conversationId, enabled]);
    const row = result.rows[0];
    return { pinned: Boolean(row.pinned_at), pinnedAt: row.pinned_at?.toISOString() ?? null, favorite: row.is_favorite };
  });
}