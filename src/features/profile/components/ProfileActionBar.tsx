import { Link } from "@tanstack/react-router";
import { Ban, Flag, MessageCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ds";

/** Фиксированная панель действий: «Написать» + ненавязчивая жалоба/блокировка. */
export function ProfileActionBar({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-background/92 backdrop-blur lg:bottom-0">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 lg:px-8">
        <Button asChild size="lg" className="flex-1">
          <Link to="/chat">
            <MessageCircle aria-hidden="true" />
            Написать
          </Link>
        </Button>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Другие действия"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>

          {open ? (
            <div className="absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
              <button
                type="button"
                onClick={() => {
                  setNotice("Жалоба отправлена модерации");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <Flag className="size-4" aria-hidden="true" />
                Пожаловаться
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotice(`${name} больше не увидит твой профиль`);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <Ban className="size-4" aria-hidden="true" />
                Заблокировать
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="pb-3 text-center text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
