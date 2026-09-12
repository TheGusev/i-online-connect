import { Link, useNavigate } from "@tanstack/react-router";
import { Ban, Flag, MessageCircle, MoreHorizontal, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ds";
import { useOpenConversation } from "@/features/chat/hooks";
import { ReportModal } from "@/features/trust/components/ReportModal";

/** Компактный ряд действий под шапкой: «Написать» + ненавязчивая жалоба/блокировка. */
export function ProfileActionBar({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const navigate = useNavigate();
  const openConversation = useOpenConversation();

  const write = () => {
    if (openConversation.isPending) return;
    openConversation.mutate(id, {
      onSuccess: ({ conversationId }) => {
        void navigate({ to: "/chat/$id", params: { id: conversationId } });
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Не удалось открыть диалог");
      },
    });
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <Button className="flex-1" onClick={write} disabled={openConversation.isPending}>
          <MessageCircle aria-hidden="true" />
          {openConversation.isPending ? "Открываем…" : "Написать"}
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
            <div className="absolute bottom-full right-0 mb-2 w-60 overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
              <button
                type="button"
                onClick={() => {
                  setReportOpen(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <Flag className="size-4" aria-hidden="true" />
                Пожаловаться
              </button>
              <Link
                to="/safety-center"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Центр безопасности
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toast.success(`${name} заблокирован`, {
                    description: "Профиль больше не появится в подборках, писать он не сможет.",
                  });
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

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        subjectId={id}
        subjectName={name}
        source="profile"
      />
    </div>
  );
}
