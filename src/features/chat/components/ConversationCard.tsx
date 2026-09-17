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
        "flex min-h-[3.75rem] items-center gap-3.5 rounded-[1.25rem] border border-border/60 bg-card/40 px-4 py-2.5 shadow-soft backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/25 hover:bg-card/60",
        unread && "conversation-card-unread min-h-[5.375rem] border-primary/60 bg-card/75 py-3",
      )}
    >
      <Avatar
        name={conversation.participant.name}
        src={conversation.participant.avatarUrl ?? null}
        size={unread ? "md" : "sm"}
        online={conversation.participant.online}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>
            {conversation.participant.name}
          </span>
          <TrustBadge
            level={badgeLevel(conversation.participant.trustLevel)}
            size="sm"
            iconOnly
          />
        </div>
        <p
          className={cn(
            "truncate text-sm",
            unread && "mt-0.5",
            unread ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {conversation.lastMessageFromMe && conversation.lastMessage ? "Вы: " : ""}
          {preview}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[10px] font-medium text-muted-foreground">
          {timeLabel(conversation.lastMessageAt)}
        </span>
        {unread ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
            {conversation.unreadCount}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
