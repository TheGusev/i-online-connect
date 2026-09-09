import { AlertCircle, Check, CheckCheck, CalendarHeart, Clock } from "lucide-react";

import type { Message } from "@/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/useSessionStore";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  message,
  onRetry,
}: {
  message: Message;
  /** Повторить отправку, если сообщение не ушло. */
  onRetry?: (message: Message) => void;
}) {
  const myId = useSessionStore((s) => s.user?.id);
  const mine = message.authorId === myId || message.authorId === "me";
  const meeting = message.kind === "meeting";
  const failed = message.status === "failed";

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-soft",
          mine
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg border border-border bg-card text-foreground",
          meeting && !mine && "border-primary/25 bg-gradient-warm",
          message.status === "sending" && "opacity-70",
          failed && "ring-2 ring-destructive/60",
        )}
      >
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
        <p className="whitespace-pre-wrap">{message.text}</p>
        <span
          className={cn(
            "mt-1.5 flex items-center justify-end gap-1 text-[11px]",
            mine ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {failed ? (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
            >
              <AlertCircle className="size-3.5" aria-hidden="true" />
              Не отправлено · повторить
            </button>
          ) : (
            <>
              {time(message.createdAt)}
              {mine ? (
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
