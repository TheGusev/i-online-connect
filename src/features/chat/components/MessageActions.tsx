import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Message } from "@/api";
import { cn } from "@/lib/utils";
import { useOverlayPresence } from "@/lib/useOverlayPresence";
import { MORE_REACTIONS, QUICK_REACTIONS, myReaction, useReactionToggle } from "@/features/chat/reactions";
import { LiveEmoji } from "./LiveEmoji";
import { useKeyboardInset } from "@/hooks/useViewportHeight";
import { computeActionsPosition } from "@/features/chat/actions-position";

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
  const target = albumLive.length > 1 ? albumLive[albumLive.length - 1] : shown;
  const toggleReaction = useReactionToggle();
  const current = myReaction(target?.reactions);
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState<ReturnType<typeof computeActionsPosition> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useKeyboardInset();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (message) { setMore(false); setPos(null); openedAt.current = Date.now(); }
  }, [message?.id]);

  useEffect(() => {
    if (!message) return;
    const li = document.getElementById(`message-${message.id}`);
    const tile = Array.from(document.querySelectorAll<HTMLElement>("[data-tile-id]")).find((node) => node.dataset["tileId"] === message.id);
    const bubble = li?.querySelector<HTMLElement>("[data-bubble]");
    const el = tile ?? bubble?.querySelector<HTMLElement>("[data-message-photo], video")?.closest<HTMLElement>(".chat-media-frame") ?? bubble ?? li;
    el?.classList.add("message-actions-selected");
    let frame = 0;
    const update = () => {
      if (!el) return;
      const vv = window.visualViewport;
      const viewport = { top: vv?.offsetTop ?? 0, height: vv?.height ?? window.innerHeight, width: vv?.width ?? window.innerWidth };
      let rect = el.getBoundingClientRect();
      const scroller = el.closest<HTMLElement>("main") ?? el.closest<HTMLElement>("[data-chat-scroller]");
      const scrollRect = scroller?.getBoundingClientRect();
      const upper = Math.max(viewport.top + 8, (scrollRect?.top ?? viewport.top) + 8);
      const lower = Math.min(viewport.top + viewport.height - 8, (scrollRect?.bottom ?? viewport.top + viewport.height) - 8);
      if (scroller && (rect.bottom > lower || rect.top < upper)) {
        const delta = rect.height > lower - upper ? rect.top - upper : rect.bottom > lower ? rect.bottom - lower : rect.top - upper;
        scroller.scrollTop += delta;
        rect = el.getBoundingClientRect();
      }
      setPos(computeActionsPosition({ rect, viewport, panelHeight: panelRef.current?.offsetHeight || (more ? 310 : 112) + (albumLive.length > 1 ? 72 : 0), mine }));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (panelRef.current) observer?.observe(panelRef.current);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      el?.classList.remove("message-actions-selected");
    };
  }, [message?.id, mine, more, albumLive.length, keyboardInset, mounted]);

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
      className={cn("viewport-overlay z-[85] bg-background/40", !pos && "invisible", leaving ? "backdrop-leave" : "backdrop-enter", NO_SELECT)}
      role="dialog"
      aria-modal="true"
      aria-label="Действия с сообщением"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { if (e.target === e.currentTarget && !fresh() && !leaving) onClose(); }}
    >
      <div
        ref={panelRef}
        className={cn(
          "absolute w-[min(320px,calc(100%-16px))] overflow-y-auto rounded-3xl border border-border/60 bg-card/85 p-1.5 shadow-glow backdrop-blur-md",
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
            {MORE_EMOJI.map((emoji, index) => (
              <button key={emoji} type="button" className="grid aspect-square place-items-center rounded-lg text-xl active:scale-90" onClick={() => react(emoji)}>
                <LiveEmoji symbol={emoji} seed={index} />
              </button>
            ))}
          </div>
        ) : null}
        {deletable && albumLive.length > 1 ? (
          <div className="mt-1 flex flex-col border-t border-border pt-1 text-xs font-medium">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-destructive hover:bg-secondary"
              onClick={() => { if (fresh()) return; onDelete(current2); onClose(); }}
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
                onClick={() => { if (fresh()) return; onEdit?.(current2); onClose(); }}
              >
                <Pencil className="size-3" aria-hidden="true" />
                Изменить
              </button>
            ) : null}
            {deletable ? (
              <button
                type="button"
                className="flex flex-1 items-center gap-1 whitespace-nowrap rounded-xl px-2 py-2 text-destructive hover:bg-secondary"
                onClick={() => { if (fresh()) return; onDelete(current2); onClose(); }}
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
