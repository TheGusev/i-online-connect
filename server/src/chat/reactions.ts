/**
 * Реакции на сообщения: общие правила для личных чатов и сообществ.
 * Список эмодзи совпадает с src/features/chat/reactions.ts (проверяется тестом).
 */
import { z } from "zod";

import { query, transaction } from "../db.ts";
import { HttpError } from "../http.ts";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;
export const MORE_REACTIONS = "😀 😁 😅 🤣 😊 😍 🥰 😘 😎 🤩 🤔 🤨 😐 🙄 😏 😴 😭 😡 🤯 😱 🥳 😇 🤗 🤝 👏 🙏 💪 👌 ✌️ 🤞 👋 🙌 💯 ✨ 🎉 💔 💕 💖 🌹 🍷 ☕ 🌙 ⭐ 😈 👀 🫶".split(" ");
export const ALLOWED_REACTIONS: readonly string[] = [...QUICK_REACTIONS, ...MORE_REACTIONS];

/** Сколько разных реакций один человек может поставить на одно сообщение. */
export const REACTIONS_PER_USER = 1;

export interface ReactionSummary { emoji: string; count: number; mine: boolean }

export type ReactionTable = "message_reactions" | "space_message_reactions";

export const reactionBody = z.object({
  emoji: z.string().refine((value) => ALLOWED_REACTIONS.includes(value), "Недопустимая реакция"),
});

/**
 * Что сделать при новой реакции. При лимите 1 новая заменяет прежнюю;
 * при большем лимите превышение — ошибка REACTION_LIMIT.
 */
export function planReaction(mine: string[], emoji: string, limit = REACTIONS_PER_USER): { remove: string[]; add: boolean } {
  if (mine.includes(emoji)) return { remove: [], add: false };
  if (limit === 1) return { remove: mine, add: true };
  if (mine.length >= limit) throw new HttpError(400, "Слишком много реакций на сообщение", "REACTION_LIMIT");
  return { remove: [], add: true };
}

export async function putReaction(table: ReactionTable, messageId: string, userId: string, emoji: string) {
  await transaction(async (client) => {
    const { rows } = await client.query<{ emoji: string }>(
      `SELECT emoji FROM ${table} WHERE message_id = $1 AND user_id = $2 FOR UPDATE`,
      [messageId, userId],
    );
    const plan = planReaction(rows.map((r) => r.emoji), emoji);
    if (plan.remove.length) {
      await client.query(`DELETE FROM ${table} WHERE message_id = $1 AND user_id = $2 AND emoji = ANY($3::text[])`, [messageId, userId, plan.remove]);
    }
    if (plan.add) {
      await client.query(`INSERT INTO ${table} (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [messageId, userId, emoji]);
    }
  });
}

export async function deleteReaction(table: ReactionTable, messageId: string, userId: string, emoji: string) {
  await query(`DELETE FROM ${table} WHERE message_id = $1 AND user_id = $2 AND emoji = $3`, [messageId, userId, emoji]);
}

/** Сводка по сообщениям: [{emoji, count, mine}] в порядке первой реакции. */
export async function loadReactions(table: ReactionTable, messageIds: string[], userId: string) {
  const map = new Map<string, ReactionSummary[]>();
  if (!messageIds.length) return map;
  const rows = await query<{ message_id: string; emoji: string; count: number; mine: boolean }>(
    `SELECT message_id, emoji, count(*)::int AS count, bool_or(user_id = $2) AS mine, min(created_at) AS first_at
       FROM ${table} WHERE message_id = ANY($1::uuid[])
      GROUP BY message_id, emoji ORDER BY first_at`,
    [messageIds, userId],
  );
  for (const row of rows) {
    const list = map.get(row.message_id) ?? [];
    list.push({ emoji: row.emoji, count: row.count, mine: row.mine });
    map.set(row.message_id, list);
  }
  return map;
}
