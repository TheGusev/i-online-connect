import { Link } from "@tanstack/react-router";
import { Check, CheckCheck, Pin, Star } from "lucide-react";
import { useEffect, useRef } from "react";

import type { Conversation } from "@/api";
import { Avatar, getTrustLevel } from "@/components/ds";
import { cn } from "@/lib/utils";

function timeLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ConversationCard({
  conversation,
  onActions,
}: {
  conversation: Conversation;
  onActions?: (conversation: Conversation) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const unread = conversation.unreadCount > 0;
  const preview = conversation.lastMessage || "Диалог ещё не начат";

  return (
    <Link
      data-no-swipe
      onPointerDown={(event) => {
        if (event.button !== 0 || !onActions) return;
        cancelHold();
        held.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          held.current = true;
          onActions(conversation);
        }, 400);
      }}
      onPointerMove={(event) => {
        if (
          origin.current &&
          Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10
        )
          cancelHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onClick={(event) => {
        if (held.current) {
          event.preventDefault();
          held.current = false;
        }
      }}
      onContextMenu={(event) => {
        if (onActions) {
          event.preventDefault();
          cancelHold();
          held.current = true;
          onActions(conversation);
        }
      }}
      onDragStart={(event) => event.preventDefault()}
      to="/chat/$id"
      params={{ id: conversation.id }}
      className={cn(
        "flex min-h-[3.75rem] select-none items-center gap-3.5 rounded-[1.25rem] border border-border/60 bg-card/40 px-4 py-2.5 shadow-soft backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/25 hover:bg-card/60 [-webkit-touch-callout:none]",
        unread && "conversation-card-unread min-h-[5.375rem] border-primary/60 bg-card/75 py-3",
      )}
    >
      <Avatar
        name={conversation.participant.name}
        src={conversation.participant.avatarUrl ?? null}
        size={unread ? "md" : "sm"}
        online={conversation.participant.online}
        trust={getTrustLevel(conversation.participant)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-bold text-foreground" : "font-medium text-foreground/80",
            )}
          >
            {conversation.participant.name}
          </span>
          {conversation.pinned ? (
            <Pin className="size-3 shrink-0 text-primary" aria-label="Закреплён" />
          ) : null}
          {conversation.favorite ? (
            <Star className="size-3 shrink-0 text-primary" aria-label="В избранном" />
          ) : null}
        </div>
        <p
          className={cn(
            "truncate text-sm",
            unread && "mt-0.5",
            unread ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {conversation.lastMessageFromMe && conversation.lastMessage ? "Вы: " : ""}
          {preview}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          {conversation.lastMessageFromMe && conversation.lastMessage ? (
            conversation.lastMessageRead ? (
              <CheckCheck className="size-3.5 text-primary" aria-label="Прочитано" />
            ) : (
              <Check className="size-3.5 text-primary" aria-label="Отправлено" />
            )
          ) : null}
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
