import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const MORE_EMOJI = "😀 😁 😅 🤣 😊 😍 🥰 😘 😎 🤩 🤔 🤨 😐 🙄 😏 😴 😭 😡 🤯 😱 🥳 😇 🤗 🤝 👏 🙏 💪 👌 ✌️ 🤞 👋 🙌 💯 ✨ 🎉 💔 💕 💖 🌹 🍷 ☕ 🌙 ⭐ 😈 👀 🫶".split(" ");

/** Компактный поповер у сообщения: реакции, «+» с сеткой, изменить и удалить. */
export function MessageActions({
  message,
  mine,
  onClose,
  onEdit,
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
  const current = useReaction(message?.id ?? "");
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    setMore(false);
    openedAt.current = Date.now();
    const li = document.getElementById(`message-${message.id}`);
    const el = (li?.querySelector(":scope > div") as HTMLElement | null) ?? null;
    el?.classList.add("ring-2", "ring-primary");
    const rect = (el ?? li)?.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(320, window.innerWidth - 16);
    if (rect) {
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, mine ? rect.right - width : rect.left));
      setPos(rect.top > vh - rect.bottom ? { bottom: vh - rect.top + 8, left } : { top: rect.bottom + 8, left });
    } else setPos({ top: 80, left: 8 });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.classList.remove("ring-2", "ring-primary");
    };
  }, [message, mine, onClose]);

  if (!message || typeof document === "undefined") return null;
  const deletable = mine && !message.deletedAt;
  const editable = Boolean(onEdit) && canEditMessage(message, mine);
  const fresh = () => Date.now() - openedAt.current < 400;
  const react = (emoji: string) => { if (fresh()) return; toggleReaction(message.id, emoji); onClose(); };

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[85] bg-background/40", NO_SELECT)}
      role="dialog"
      aria-modal="true"
      aria-label="Действия с сообщением"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { if (e.target === e.currentTarget && !fresh()) onClose(); }}
    >
      <div
        className="fixed w-[min(320px,calc(100vw-16px))] rounded-2xl border border-border bg-card p-1.5 shadow-glow"
        style={pos ?? undefined}
      >
        {!message.deletedAt ? (
          <div className="flex items-center justify-between gap-0.5">
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Реакция ${emoji}`}
                aria-pressed={current === emoji}
                className={cn("grid size-10 place-items-center rounded-full text-xl transition-transform active:scale-90", current === emoji && "bg-primary/20 ring-1 ring-primary")}
                onClick={() => react(emoji)}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              aria-label="Больше эмодзи"
              aria-expanded={more}
              className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground"
              onClick={() => setMore((v) => !v)}
            >
              <Plus className="size-4" />
            </button>
          </div>
        ) : null}
        {more ? (
          <div className="mt-1 grid max-h-[220px] grid-cols-8 gap-0.5 overflow-y-auto border-t border-border pt-1">
            {MORE_EMOJI.map((emoji) => (
              <button key={emoji} type="button" className="grid aspect-square place-items-center rounded-lg text-xl active:scale-90" onClick={() => react(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {editable || deletable ? (
          <div className="mt-1 flex border-t border-border pt-1 text-xs font-medium">
            {editable ? (
              <button
                type="button"
                className="flex flex-1 items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-secondary"
                onClick={() => { if (fresh()) return; onEdit?.(message); onClose(); }}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Изменить
              </button>
            ) : null}
            {deletable ? (
              <button
                type="button"
                className="flex flex-1 items-center gap-1.5 rounded-xl px-3 py-2 text-destructive hover:bg-secondary"
                onClick={() => { if (fresh()) return; onDelete(message); onClose(); }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Удалить у всех
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
