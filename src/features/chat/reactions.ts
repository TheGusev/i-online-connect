import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { chatApi, spacesApi } from "@/api";
import type { Message, MessageReaction, SpaceMessage } from "@/api";
import type { MessagesPage } from "@/api/endpoints/chat";
import { messagesQueryKey } from "@/features/chat/hooks";
import { spaceMessagesQueryKey } from "@/features/spaces/hooks";

import { applyMyReaction } from "./reaction-state";
export {
  QUICK_REACTIONS, MORE_REACTIONS, REACTIONS_PER_USER,
  myReaction, applyMyReaction, mergeRemoteReactions,
} from "./reaction-state";

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
