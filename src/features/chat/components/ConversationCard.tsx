import { Link } from "@tanstack/react-router";

import type { Conversation } from "@/api";
import { Avatar, TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";
import { cn } from "@/lib/utils";

function timeLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ConversationCard({ conversation }: { conversation: Conversation }) {
  const unread = conversation.unreadCount > 0;
  const preview = conversation.lastMessage || "Диалог ещё не начат";

  return (
    <Link
      to="/chat/$id"
      params={{ id: conversation.id }}
      className={cn(
        "flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        unread && "border-primary/30 bg-primary-soft/40",
      )}
    >
      <Avatar
        name={conversation.participant.name}
        src={conversation.participant.avatarUrl}
        size="lg"
        online={conversation.participant.online}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">
            {conversation.participant.name}
          </span>
          <TrustBadge level={badgeLevel(conversation.participant.trustLevel)} size="sm" />
        </div>
        <p
          className={cn(
            "mt-1 truncate text-sm",
            unread ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {conversation.lastMessageFromMe && conversation.lastMessage ? "Вы: " : ""}
          {preview}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground">
          {timeLabel(conversation.lastMessageAt)}
        </span>
        {unread ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
            {conversation.unreadCount}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Прочитано</span>
        )}
      </div>
    </Link>
  );
}
