import { Check, CheckCheck, CalendarHeart } from "lucide-react";

import type { Message } from "@/api";
import { cn } from "@/lib/utils";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message }: { message: Message }) {
  const mine = message.authorId === "me";
  const meeting = message.kind === "meeting";

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-soft",
          mine
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg border border-border bg-card text-foreground",
          meeting && !mine && "border-primary/25 bg-gradient-warm",
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
          {time(message.createdAt)}
          {mine ? (
            message.status === "read" ? (
              <CheckCheck className="size-3.5" aria-label="Прочитано" />
            ) : (
              <Check className="size-3.5" aria-label="Отправлено" />
            )
          ) : null}
        </span>
      </div>
    </li>
  );
}
