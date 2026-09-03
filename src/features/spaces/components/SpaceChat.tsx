import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

import type { SpaceMessage } from "@/api";
import { Avatar, Button } from "@/components/ds";
import { cn } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Групповой чат сообщества — отдельно от личных диалогов. */
export function SpaceChat({
  messages,
  canWrite,
  onSend,
  sending,
}: {
  messages: SpaceMessage[];
  canWrite: boolean;
  onSend: (text: string) => void;
  sending?: boolean | undefined;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="max-h-96 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В чате пока тихо. Можно поздороваться и спросить, как обычно проходят встречи.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.authorId === "me";
            return (
              <div
                key={message.id}
                className={cn("flex gap-3", mine && "flex-row-reverse text-right")}
              >
                <Avatar name={message.authorName} size="sm" />
                <div className="min-w-0 max-w-[80%]">
                  <p className="text-xs text-muted-foreground">
                    {message.authorName} · {timeFormatter.format(new Date(message.createdAt))}
                  </p>
                  <p
                    className={cn(
                      "mt-1 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      mine
                        ? "bg-community text-community-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {message.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
        style={keyboardInset > 0 ? { paddingBottom: keyboardInset + 12 } : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          const value = text.trim();
          if (!value || !canWrite) return;
          onSend(value);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!canWrite}
          aria-label="Сообщение в чат сообщества"
          placeholder={canWrite ? "Написать в общий чат" : "Чат доступен участникам сообщества"}
          className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-community focus:ring-4 focus:ring-community/12 disabled:opacity-60"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Отправить"
          loading={sending ?? false}
          disabled={!canWrite || text.trim().length === 0}
          className="bg-community text-community-foreground hover:bg-community/90"
        >
          <SendHorizontal aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
