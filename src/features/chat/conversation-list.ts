import type { Conversation } from "@/api";

export type ConversationTab = "all" | "favorite" | "awaiting";
export const DEFAULT_CONVERSATION_TAB: ConversationTab = "all";

export function filterConversations(items: Conversation[], tab: ConversationTab): Conversation[] {
  return items.filter((item) => tab === "favorite" ? item.favorite : tab === "awaiting" ? item.awaitingReply : true)
    .sort((a, b) => {
      if (tab !== "awaiting") {
        const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        if (pinned) return pinned;
        if (a.pinned && b.pinned) return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
      }
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
}