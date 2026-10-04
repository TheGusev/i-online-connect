import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { Message } from "@/api";
import { cn } from "@/lib/utils";
import { toggleReaction, useReaction } from "@/features/chat/useMessageGestures";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const NO_SELECT = "select-none [-webkit-touch-callout:none] [-webkit-user-select:none]";

/** Своё текстовое сообщение можно править сутки после отправки. */
export function canEditMessage(message: Message, mine: boolean) {
  return (
    mine &&
    !message.deletedAt &&
    (message.kind ?? "text") === "text" &&
    message.status !== "sending" &&
    message.status !== "failed" &&
    Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS
  );
}

/** Нижний лист после долгого нажатия: реакции и удаление своего сообщения. */
export function MessageActions({
  message,
  mine,
  onClose,
  onDelete,
}: {
  message: Message | null;
  mine: boolean;
  onClose: () => void;
  onEdit?: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReply?: (message: Message) => void;
}) {
  const openedAt = useRef(0);
  const dragY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const current = useReaction(message?.id ?? "");

  useEffect(() => {
    if (!message) return;
    openedAt.current = Date.now();
    const el = document.getElementById(`message-${message.id}`)?.firstElementChild?.nextElementSibling as HTMLElement | null
      ?? document.getElementById(`message-${message.id}`)?.firstElementChild as HTMLElement | null;
    el?.classList.add("scale-[1.02]", "ring-2", "ring-primary");
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.classList.remove("scale-[1.02]", "ring-2", "ring-primary");
    };
  }, [message, onClose]);

  if (!message || typeof document === "undefined") return null;
  const deletable = mine && !message.deletedAt;
  // Игнорируем отпускание пальца, завершившее само удержание.
  const fresh = () => Date.now() - openedAt.current < 400;

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[85] flex items-end justify-center bg-background/60", NO_SELECT)}
      role="dialog"
      aria-modal="true"
      aria-label="Действия с сообщением"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { if (e.target === e.currentTarget && !fresh()) onClose(); }}
    >
      <div
        ref={sheetRef}
        className="w-full max-w-md rounded-t-3xl border border-border bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-glow transition-transform"
        onPointerDown={(e) => { dragY.current = e.clientY; }}
        onPointerMove={(e) => {
          if (dragY.current === null || !sheetRef.current) return;
          const dy = Math.max(0, e.clientY - dragY.current);
          sheetRef.current.style.transform = `translateY(${dy}px)`;
        }}
        onPointerUp={(e) => {
          const dy = dragY.current === null ? 0 : e.clientY - dragY.current;
          dragY.current = null;
          if (sheetRef.current) sheetRef.current.style.transform = "";
          if (dy > 60) onClose();
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {!message.deletedAt ? (
          <div className="flex justify-between gap-1">
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Реакция ${emoji}`}
                aria-pressed={current === emoji}
                className={cn("grid size-12 place-items-center rounded-full text-2xl transition-transform active:scale-90", current === emoji && "bg-primary/20 ring-1 ring-primary")}
                onClick={() => { if (fresh()) return; toggleReaction(message.id, emoji); onClose(); }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {deletable ? (
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-destructive hover:bg-secondary"
            onClick={() => { if (fresh()) return; onDelete(message); onClose(); }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Удалить у всех
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
