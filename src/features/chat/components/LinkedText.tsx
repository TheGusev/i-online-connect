import { useState } from "react";

import { Button, Modal } from "@/components/ds";
import { cn } from "@/lib/utils";
import { hostOf, isSuspiciousUrl, splitLinks } from "@/features/chat/linkify";

/** Текст сообщения с кликабельными ссылками; подозрительные — через подтверждение. */
export function LinkedText({ text, mine = false }: { text: string; mine?: boolean }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const parts = splitLinks(text);
  return (
    <>
      {parts.map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn("break-all font-semibold underline underline-offset-2", mine ? "text-primary-foreground decoration-primary-foreground/70" : "text-primary-ink decoration-primary-ink/60")}
            onClick={(event) => {
              event.stopPropagation();
              if (isSuspiciousUrl(part.href)) {
                event.preventDefault();
                setConfirm(part.href);
              }
            }}
          >
            {part.value}
          </a>
        ),
      )}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Открыть ссылку?"
        description={confirm ? `Ссылка ведёт на внешний сайт: ${hostOf(confirm)}. Открыть?` : undefined}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Отмена</Button>
            <Button onClick={() => { if (confirm) window.open(confirm, "_blank", "noopener,noreferrer"); setConfirm(null); }}>Открыть</Button>
          </div>
        }
      />
    </>
  );
}
