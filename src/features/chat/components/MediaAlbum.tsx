import { Check, CheckCheck, Clock, Reply, RotateCcw, Trash2 } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { mediaUrl, type GalleryItem, type Message } from "@/api";
import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { albumLayout, tileKey } from "@/features/chat/albums";
import { useMessageGestures, useReaction } from "@/features/chat/useMessageGestures";
import { useSessionStore } from "@/store/useSessionStore";

import { GalleryViewer } from "./MediaGallery";
import { ReactionChip } from "./ReactionChip";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const NO_SELECT = "select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]";

/**
 * Альбом из нескольких фото ведёт себя как одиночное фото: удержание плитки — меню,
 * свайп — ответ, реакция — на последнее фото. Нажатие открывает просмотр всех фото.
 */
export function MediaAlbum({
  messages,
  authorName,
  onRetry,
  onActions,
  onReply,
  onDelete,
}: {
  messages: Message[];
  authorName?: string | undefined;
  onRetry?: ((message: Message) => void) | undefined;
  /** Удержание плитки: меню действий для этого фото с контекстом альбома. */
  onActions?: ((message: Message, album: Message[]) => void) | undefined;
  /** Свайп или «Ответить» в просмотре: ответ на альбом. */
  onReply?: ((album: Message[]) => void) | undefined;
  /** Удаление из просмотра: одно фото или весь альбом. */
  onDelete?: ((messages: Message[]) => void) | undefined;
}) {
  const myId = useSessionStore((s) => s.user?.id);
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [held, setHeld] = useState<Message | null>(null);
  const last = messages[messages.length - 1]!;
  const mine = last.authorId === myId || last.authorId === "me";
  const { visible: count, rest, grid, big } = albumLayout(messages.length);
  const visible = messages.slice(0, count);
  const reaction = useReaction(last.id);
  const settled = messages.every((m) => m.status !== "sending" && m.status !== "failed");

  const gestures = useMessageGestures({
    ...(onActions ? { onHold: () => onActions(held ?? last, messages) } : {}),
    ...(onReply && settled ? { onReply: () => onReply(messages) } : {}),
  });

  const items: GalleryItem[] = messages
    .filter((m) => m.mediaUrl)
    .map((m) => ({
      id: m.id,
      kind: "image" as const,
      mediaUrl: m.mediaUrl!,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: authorName ?? "",
    }));
  const sending = messages.some((m) => m.status === "sending");
  const read = messages.every((m) => m.status === "read");

  const viewerActions = (item: GalleryItem) => {
    const current = messages.find((m) => m.id === item.id);
    if (!current) return null;
    return (
      <>
        {onReply && settled ? (
          <Button type="button" variant="secondary" className="rounded-full px-4 py-2 text-sm font-semibold" onClick={() => { setViewer(null); onReply(messages); }}>
            <Reply className="size-4" aria-hidden="true" /> Ответить
          </Button>
        ) : null}
        {onDelete && mine && settled ? (
          confirmDelete ? (
            <>
              <Button type="button" variant="secondary" className="rounded-full px-4 py-2 text-sm font-semibold text-destructive" onClick={() => { setConfirmDelete(false); setViewer(null); onDelete([current]); }}>
                Удалить это фото
              </Button>
              <Button type="button" variant="secondary" className="rounded-full px-4 py-2 text-sm font-semibold text-destructive" onClick={() => { setConfirmDelete(false); setViewer(null); onDelete(messages); }}>
                Удалить весь альбом ({messages.length})
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" className="rounded-full px-4 py-2 text-sm font-semibold text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden="true" /> Удалить
            </Button>
          )
        ) : null}
      </>
    );
  };

  return (
    <li id={`message-${last.id}`} className={cn("album-in flex", NO_SELECT, mine ? "justify-end" : "justify-start")}>
      <div
        data-bubble
        data-no-swipe
        draggable={false}
        {...gestures.handlers}
        onPointerDownCapture={(event) => {
          const id = (event.target as HTMLElement).closest<HTMLElement>("[data-tile-id]")?.dataset["tileId"];
          setHeld(messages.find((m) => m.id === id) ?? null);
        }}
        style={{
          touchAction: "pan-y",
          transform: gestures.offset ? `translateX(${gestures.offset}px)` : undefined,
          transition: gestures.offset ? undefined : "transform 260ms cubic-bezier(.34,1.56,.64,1)",
        }}
        className={cn("flex w-[min(18rem,78%)] flex-col gap-1", NO_SELECT)}
      >
        <div className={cn("chat-media-frame relative grid gap-[2px] overflow-hidden rounded-2xl bg-border transition-[aspect-ratio] duration-200", grid)}>
          {visible.map((message, index) => {
            const failed = message.status === "failed";
            const src = message.mediaUrl
              ? message.mediaUrl.startsWith("blob:")
                ? message.mediaUrl
                : (mediaUrl(message.mediaUrl) ?? message.mediaUrl)
              : null;
            const itemIndex = items.findIndex((item) => item.id === message.id);
            return (
              <div
                key={tileKey(message)}
                data-tile-id={message.id}
                className={cn("album-tile relative min-h-0 overflow-hidden bg-secondary", index === big && "row-span-2")}
                style={{ "--tile-delay": `${index * 60}ms` } as CSSProperties}
              >
                {src ? (
                  <button
                    type="button"
                    data-message-photo
                    aria-label={`Открыть фото ${index + 1} из ${messages.length}`}
                    className="block size-full"
                    onClick={() => itemIndex >= 0 && setViewer(itemIndex)}
                  >
                    <img src={src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                  </button>
                ) : null}
                {message.status === "sending" ? (
                  <span className="absolute inset-0 grid place-items-center bg-background/35">
                    <span className="size-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-label="Загружается" />
                  </span>
                ) : null}
                {failed ? (
                  <button
                    type="button"
                    data-no-gesture
                    onClick={() => onRetry?.(message)}
                    className="absolute inset-0 grid place-items-center bg-background/70 text-xs font-semibold text-destructive"
                  >
                    <span className="flex flex-col items-center gap-1">
                      <RotateCcw className="size-5" aria-hidden="true" />
                      Повторить
                    </span>
                  </button>
                ) : null}
                {rest > 0 && index === visible.length - 1 ? (
                  <button
                    type="button"
                    data-message-photo
                    onClick={() => setViewer(Math.min(3, items.length - 1))}
                    className="absolute inset-0 grid place-items-center bg-background/60 text-2xl font-bold text-foreground"
                  >
                    +{rest}
                  </button>
                ) : null}
              </div>
            );
          })}
          <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex flex-wrap items-center justify-between gap-1">
            {reaction ? <ReactionChip emoji={reaction} mine={false} overlay /> : <span />}
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
              {time(last.createdAt)}
              {mine ? (
                sending ? (
                  <Clock className="size-3.5" aria-label="Отправляется" />
                ) : read ? (
                  <CheckCheck className="size-3.5" aria-label="Прочитано" />
                ) : (
                  <Check className="size-3.5" aria-label="Отправлено" />
                )
              ) : null}
            </span>
          </span>
        </div>
      </div>
      {viewer !== null ? (
        <GalleryViewer
          items={items}
          index={viewer}
          onIndex={(i) => { setConfirmDelete(false); setViewer(i); }}
          onClose={() => { setConfirmDelete(false); setViewer(null); }}
          {...(onReply || onDelete ? { extraActions: viewerActions } : {})}
        />
      ) : null}
    </li>
  );
}
