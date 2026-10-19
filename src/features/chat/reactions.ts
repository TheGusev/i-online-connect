import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { chatApi, spacesApi } from "@/api";
import type { Message, MessageReaction, SpaceMessage } from "@/api";
import type { MessagesPage } from "@/api/endpoints/chat";
import { messagesQueryKey } from "@/features/chat/hooks";
import { spaceMessagesQueryKey } from "@/features/spaces/hooks";

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

export type ReactionScope = { type: "chat" | "space"; id: string };

type Toggle = (message: Message, emoji: string) => void;
export const ReactionContext = createContext<Toggle | null>(null);
export function useReactionToggle() { return useContext(ReactionContext); }

type ChatData = InfiniteData<MessagesPage, string | null>;

/** Поставить/снять реакцию: показываем сразу, при ошибке откатываем. */
export function useToggleReaction(scope: ReactionScope): Toggle {
  const client = useQueryClient();
  const patch = (messageId: string, fn: (r: MessageReaction[] | undefined) => MessageReaction[]) => {
    if (scope.type === "chat") {
      client.setQueryData<ChatData>(messagesQueryKey(scope.id), (prev) => prev && {
        ...prev,
        pages: prev.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === messageId ? { ...m, reactions: fn(m.reactions) } : m)) })),
      });
    } else {
      client.setQueryData<SpaceMessage[]>(spaceMessagesQueryKey(scope.id), (prev) =>
        prev?.map((m) => (m.id === messageId ? { ...m, reactions: fn(m.reactions) } : m)));
    }
  };
  const mutation = useMutation({
    mutationFn: ({ messageId, emoji, action }: { messageId: string; emoji: string; action: "put" | "delete"; previous: MessageReaction[] | undefined }) =>
      scope.type === "chat"
        ? chatApi.setReaction(scope.id, messageId, emoji, action)
        : spacesApi.setSpaceReaction(scope.id, messageId, emoji, action),
    onMutate: ({ messageId, emoji, action }) => patch(messageId, (r) => applyMyReaction(r, emoji, action)),
    onSuccess: (result) => patch(result.messageId, () => result.reactions),
    onError: (_error, vars) => patch(vars.messageId, () => vars.previous ?? []),
  });
  return (message, emoji) => {
    if (message.id.startsWith("tmp-") || message.deletedAt) return;
    const mine = message.reactions?.some((r) => r.emoji === emoji && r.mine);
    mutation.mutate({ messageId: message.id, emoji, action: mine ? "delete" : "put", previous: message.reactions });
  };
}
