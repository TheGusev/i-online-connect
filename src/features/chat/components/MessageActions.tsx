import { Copy, Pencil, Reply, Trash2, X } from "lucide-react";
import { useEffect } from "react";

import type { Message } from "@/api";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

/**
 * Действия над сообщением: нижний лист на телефоне, обычное меню на компьютере
 * (по правому клику открывается тот же список).
 */
export function MessageActions({
  message,
  mine,
  onClose,
  onEdit,
  onDelete,
  onReply,
}: {
  message: Message | null;
  mine: boolean;
  onClose: () => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReply?: (message: Message) => void;
}) {
  useEffect(() => {
    if (!message) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [message, onClose]);

  if (!message) return null;
  const editable = canEditMessage(message, mine);
  const deletable = mine && !message.deletedAt;
  const copyable = !message.deletedAt && Boolean(message.text) && message.kind !== "voice";

  const item =
    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-secondary";

  return (
    <div
      className="viewport-overlay z-50 flex items-end justify-center bg-background/70 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Действия с сообщением"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-border bg-card p-2 shadow-glow"
        onClick={(event) => event.stopPropagation()}
      >
        {onReply &&
        !message.deletedAt &&
        message.status !== "sending" &&
        message.status !== "failed" ? (
          <button
            type="button"
            className={item}
            onClick={() => {
              onReply(message);
              onClose();
            }}
          >
            <Reply className="size-4" aria-hidden="true" />
            Ответить
          </button>
        ) : null}

        {copyable ? (
          <button
            type="button"
            className={item}
            onClick={() => {
              void navigator.clipboard?.writeText(message.text);
              onClose();
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
            Копировать текст
          </button>
        ) : null}

        {editable ? (
          <button
            type="button"
            className={item}
            onClick={() => {
              onEdit(message);
              onClose();
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Изменить
          </button>
        ) : null}

        {deletable ? (
          <button
            type="button"
            className={`${item} text-destructive`}
            onClick={() => {
              onDelete(message);
              onClose();
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Удалить у всех
          </button>
        ) : null}

        <button type="button" className={`${item} text-muted-foreground`} onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
          Отмена
        </button>
      </div>
    </div>
  );
}
