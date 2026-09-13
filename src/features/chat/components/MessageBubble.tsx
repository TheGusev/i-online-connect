import { AlertCircle, Check, CheckCheck, CalendarHeart, Clock } from "lucide-react";
import { useRef } from "react";

import type { Message } from "@/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/useSessionStore";
import { mediaUrl } from "@/api";
import { VoicePlayer } from "./VoicePlayer";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  message,
  onRetry,
  onActions,
}: {
  message: Message;
  /** Повторить отправку, если сообщение не ушло. */
  onRetry?: (message: Message) => void;
  /** Долгое нажатие или правый клик — меню действий. */
  onActions?: (message: Message) => void;
}) {
  const myId = useSessionStore((s) => s.user?.id);
  const mine = message.authorId === myId || message.authorId === "me";
  const meeting = message.kind === "meeting";
  const voice = message.kind === "voice";
  const failed = message.status === "failed";
  const deleted = Boolean(message.deletedAt);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openActions = () => {
    if (!onActions || deleted) return;
    onActions(message);
  };
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        onContextMenu={(event) => {
          if (!onActions || deleted) return;
          event.preventDefault();
          openActions();
        }}
        onTouchStart={() => {
          clearHold();
          holdTimer.current = setTimeout(openActions, 450);
        }}
        onTouchEnd={clearHold}
        onTouchMove={clearHold}
        onTouchCancel={clearHold}
        className={cn(
          "max-w-[78%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-soft",
          mine
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg border border-border bg-card text-foreground",
          meeting && !mine && "border-primary/25 bg-gradient-warm",
          message.status === "sending" && "opacity-70",
          failed && "ring-2 ring-destructive/60",
          deleted && "border border-dashed border-border bg-secondary/40 text-muted-foreground",
        )}
      >
        {deleted ? (
          <p className="italic">Сообщение удалено</p>
        ) : (
          <>
            {meeting ? (
              <span
                className={cn(
                  "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
                  mine ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                <CalendarHeart className="size-3.5" aria-hidden="true" />
                Приглашение на встречу
              </span>
            ) : null}
            {voice && message.mediaUrl ? (
              <VoicePlayer
                src={mediaUrl(message.mediaUrl) ?? message.mediaUrl}
                duration={message.durationMs ?? 0}
                mine={mine}
              />
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
            )}
          </>
        )}
        <span
          className={cn(
            "mt-1.5 flex items-center justify-end gap-1 text-[11px]",
            mine && !deleted ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {failed ? (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              className="inline-flex flex-col items-end gap-0.5 text-right font-semibold"
            >
              <span className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                Не отправлено · повторить
              </span>
              {message.errorMessage ? (
                <span className="font-normal opacity-90">{message.errorMessage}</span>
              ) : null}
            </button>
          ) : (
            <>
              {message.editedAt && !deleted ? <span className="opacity-80">изменено</span> : null}
              {time(message.createdAt)}
              {mine && !deleted ? (
                message.status === "sending" ? (
                  <Clock className="size-3.5" aria-label="Отправляется" />
                ) : message.status === "read" ? (
                  <CheckCheck className="size-3.5" aria-label="Прочитано" />
                ) : (
                  <Check className="size-3.5" aria-label="Отправлено" />
                )
              ) : null}
            </>
          )}
        </span>
      </div>
    </li>
  );
}

