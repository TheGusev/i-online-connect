import type { MessageReaction } from "@/api/types";

/** Копия server/src/chat/reactions.ts — синхронность проверяет тест. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
export const MORE_REACTIONS = "😀 😁 😅 🤣 😊 😍 🥰 😘 😎 🤩 🤔 🤨 😐 🙄 😏 😴 😭 😡 🤯 😱 🥳 😇 🤗 🤝 👏 🙏 💪 👌 ✌️ 🤞 👋 🙌 💯 ✨ 🎉 💔 💕 💖 🌹 🍷 ☕ 🌙 ⭐ 😈 👀 🫶".split(" ");
export const REACTIONS_PER_USER = 1;

/** Моя реакция (первая из моих) — для подсветки в меню. */
export function myReaction(reactions: MessageReaction[] | undefined) {
  return reactions?.find((r) => r.mine)?.emoji ?? null;
}

/** Оптимистичный пересчёт сводки после моего действия. */
export function applyMyReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  action: "put" | "delete",
  limit = REACTIONS_PER_USER,
): MessageReaction[] {
  let list = (reactions ?? []).map((r) => ({ ...r }));
  const dropMine = (target: string) => {
    list = list
      .map((r) => (r.emoji === target && r.mine ? { ...r, count: r.count - 1, mine: false } : r))
      .filter((r) => r.count > 0);
  };
  if (action === "delete") { dropMine(emoji); return list; }
  if (list.some((r) => r.emoji === emoji && r.mine)) return list;
  if (limit === 1) list.filter((r) => r.mine).forEach((r) => dropMine(r.emoji));
  const existing = list.find((r) => r.emoji === emoji);
  if (existing) { existing.count += 1; existing.mine = true; } else list.push({ emoji, count: 1, mine: true });
  return list;
}

/** Событие сокета: счётчики от сервера, mine — по своим данным. */
export function mergeRemoteReactions(
  previous: MessageReaction[] | undefined,
  counts: { emoji: string; count: number }[],
  actorIsMe: boolean,
  actorEmojis: string[],
): MessageReaction[] {
  return counts.map(({ emoji, count }) => ({
    emoji,
    count,
    mine: actorIsMe ? actorEmojis.includes(emoji) : Boolean(previous?.find((r) => r.emoji === emoji)?.mine),
  }));
}
