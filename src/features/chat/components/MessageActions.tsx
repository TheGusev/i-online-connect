import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Message } from "@/api";
import { cn } from "@/lib/utils";
import { useOverlayPresence } from "@/lib/useOverlayPresence";
import { MORE_REACTIONS, QUICK_REACTIONS, myReaction, useReactionToggle } from "@/features/chat/reactions";
import { LiveEmoji } from "./LiveEmoji";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EMOJI = QUICK_REACTIONS;
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

const MORE_EMOJI = MORE_REACTIONS;

/** Компактный поповер у сообщения: реакции, «+» с сеткой, изменить и удалить. */
export function MessageActions({
  message,
  mine,
  canDelete,
  onClose,
  onEdit,
  onDelete,
  album,
  onDeleteAlbum,
}: {
  message: Message | null;
  mine: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onEdit?: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReply?: (message: Message) => void;
  /** Фото открыто из альбома: реакция ставится на последнее фото, удаление — на выбор. */
  album?: Message[] | null | undefined;
  onDeleteAlbum?: ((messages: Message[]) => void) | undefined;
}) {
  const openedAt = useRef(0);
  // Окно живёт в DOM ещё 160 мс после закрытия: держим последнее сообщение.
  const { mounted, leaving } = useOverlayPresence(message !== null, 160);
  const lastMessage = useRef<Message | null>(null);
  if (message) lastMessage.current = message;
  const shown = message ?? lastMessage.current;
  const albumLive = (album ?? []).filter((m) => !m.deletedAt);
  const target = albumLive.length > 1 ? albumLive[albumLive.length - 1]! : shown;
  const toggleReaction = useReactionToggle();
  const current = myReaction(target?.reactions);
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  useEffect(() => { setMore(false); }, [message]);

  useEffect(() => {
    if (!message) return;
    openedAt.current = Date.now();
    const li = document.getElementById(`message-${message.id}`) ?? document.querySelector(`[data-tile-id="${message.id}"]`)?.closest("li") ?? null;
    const el = (li?.querySelector(":scope > div") as HTMLElement | null) ?? null;
    el?.classList.add("ring-2", "ring-primary");
    const rect = (el ?? li)?.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(320, window.innerWidth - 16);
    if (rect) {
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, mine ? rect.right - width : rect.left));
      const panelHeight = (more ? 310 : 112) + ((album?.length ?? 0) > 1 ? 40 : 0);
      const preferredTop = rect.bottom + 8 + panelHeight <= vh ? rect.bottom + 8 : rect.top - panelHeight - 8;
      setPos({ top: Math.max(8, Math.min(vh - panelHeight - 8, preferredTop)), left });
    } else setPos({ top: 80, left: 8 });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.classList.remove("ring-2", "ring-primary");
    };
  }, [message, mine, onClose, more, album]);

  if (!mounted || !shown || typeof document === "undefined") return null;
  const current2 = shown; // стабильная ссылка для рендера во время выхода
  const deletable = (canDelete ?? mine) && !current2.deletedAt;
  const editable = Boolean(onEdit) && canEditMessage(current2, mine);
  const copyable = !current2.deletedAt && (current2.kind ?? "text") === "text" && current2.status !== "sending" && current2.status !== "failed" && Boolean(current2.text);
  const copy = async () => {
    if (fresh()) return;
    try {
      await navigator.clipboard.writeText(current2.text);
    } catch {
      const area = document.createElement("textarea");
      area.value = current2.text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast.success("Скопировано");
    onClose();
  };
  const fresh = () => Date.now() - openedAt.current < 400;
  const react = (emoji: string) => { if (fresh()) return; if (target && toggleReaction) toggleReaction(target, emoji); onClose(); };

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[85] bg-background/40", leaving ? "backdrop-leave" : "backdrop-enter", NO_SELECT)}
      role="dialog"
      aria-modal="true"
      aria-label="Действия с сообщением"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { if (e.target === e.currentTarget && !fresh() && !leaving) onClose(); }}
    >
      <div
        className={cn(
          "fixed w-[min(320px,calc(100vw-16px))] rounded-3xl border border-border/60 bg-card/85 p-1.5 shadow-glow backdrop-blur-md",
          leaving ? "menu-leave" : "menu-enter",
        )}
        style={pos ?? undefined}
      >
        {!current2.deletedAt ? (
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
                <LiveEmoji symbol={emoji} seed={emoji} />
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
        {deletable && albumLive.length > 1 ? (
          <div className="mt-1 flex flex-col border-t border-border pt-1 text-xs font-medium">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-destructive hover:bg-secondary"
              onClick={() => { if (fresh()) return; onDelete(message); onClose(); }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Удалить это фото
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-destructive hover:bg-secondary"
              onClick={() => { if (fresh()) return; if (onDeleteAlbum) onDeleteAlbum(albumLive); else albumLive.forEach(onDelete); onClose(); }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Удалить весь альбом ({albumLive.length})
            </button>
          </div>
        ) : copyable || editable || deletable ? (
          <div className="mt-1 flex gap-1 border-t border-border pt-1 text-xs font-medium">
            {copyable ? (
              <button
                type="button"
                className="flex flex-1 items-center gap-1 whitespace-nowrap rounded-xl px-2 py-2 hover:bg-secondary"
                onClick={() => void copy()}
              >
                <Copy className="size-3" aria-hidden="true" />
                Копировать
              </button>
            ) : null}
            {editable ? (
              <button
                type="button"
                className="flex flex-1 items-center gap-1 whitespace-nowrap rounded-xl px-2 py-2 hover:bg-secondary"
                onClick={() => { if (fresh()) return; onEdit?.(message); onClose(); }}
              >
                <Pencil className="size-3" aria-hidden="true" />
                Изменить
              </button>
            ) : null}
            {deletable ? (
              <button
                type="button"
                className="flex flex-1 items-center gap-1 whitespace-nowrap rounded-xl px-2 py-2 text-destructive hover:bg-secondary"
                onClick={() => { if (fresh()) return; onDelete(message); onClose(); }}
              >
                <Trash2 className="size-3" aria-hidden="true" />
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
