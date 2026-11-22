import { Check, CheckCheck, Clock, Images, Minimize2, Reply, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";

import { mediaUrl, type GalleryItem, type Message } from "@/api";
import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { STACK_MAX, STACK_STEP, STACK_TILE_W, stackTile, stackWidthRem, tileKey } from "@/features/chat/albums";
import { useMessageGestures } from "@/features/chat/useMessageGestures";
import { useSessionStore } from "@/store/useSessionStore";
import { buzz, hapticTrigger } from "@/lib/haptics";

import { GalleryViewer } from "./MediaGallery";
import { ReactionChips } from "./ReactionChip";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const NO_SELECT = "select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]";
const EASE = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/** Пока альбом меняет высоту, держим ленту прижатой к низу, если пользователь и так был внизу. */
function followBottom(el: HTMLElement | null, ms: number) {
  const parent = scrollParent(el);
  if (!parent || parent.scrollHeight - parent.scrollTop - parent.clientHeight > 96) return;
  const end = performance.now() + ms;
  const tick = () => {
    parent.scrollTop = parent.scrollHeight;
    if (performance.now() < end) requestAnimationFrame(tick);
  };
  tick();
}

/**
 * Альбом из нескольких фото: свёрнутая стопка внахлёст, по нажатию разворачивается в ленту,
 * нажатие на карточку ленты открывает просмотр. Удержание плитки — меню, свайп — ответ,
 * реакция — на последнее фото.
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
  const rootRef = useRef<HTMLLIElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [held, setHeld] = useState<Message | null>(null);
  const last = messages[messages.length - 1]!;
  const mine = last.authorId === myId || last.authorId === "me";
  const shown = expanded ? messages : messages.slice(0, STACK_MAX);
  const reaction = last.reactions?.length ? last.reactions : null;
  const settled = messages.every((m) => m.status !== "sending" && m.status !== "failed");

  const toggle = (next: boolean) => {
    buzz("light");
    followBottom(rootRef.current, 380);
    if (!next) rowRef.current?.scrollTo({ left: 0 });
    setExpanded(next);
  };

  const gestures = useMessageGestures({
    ...(onActions ? { onHold: () => onActions(held ?? last, messages) } : {}),
    ...(onReply && settled && !expanded ? { onReply: () => onReply(messages) } : {}),
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
    <li ref={rootRef} id={`message-${last.id}`} className={cn("album-in flex", NO_SELECT, mine ? "justify-end" : "justify-start")}>
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
          touchAction: expanded ? "pan-x pan-y" : "pan-y",
          transform: gestures.offset ? `translateX(${gestures.offset}px)` : undefined,
          transition: gestures.offset ? undefined : "transform 260ms cubic-bezier(.34,1.56,.64,1)",
        }}
        className={cn("flex max-w-[78%] flex-col gap-1", NO_SELECT)}
      >
        <div
          className={cn("relative transition-[width]", EASE)}
          style={{ width: expanded ? "min(18rem,78vw)" : `${stackWidthRem(messages.length)}rem` }}
        >
          <div
            ref={rowRef}
            className={cn(
              "flex items-center overflow-y-hidden transition-[height] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              EASE,
              expanded ? "snap-x snap-mandatory overflow-x-auto" : "overflow-x-hidden",
            )}
            style={{ height: expanded ? "9.5rem" : "7rem" }}
          >
            {shown.map((message, index) => {
              const failed = message.status === "failed";
              const src = message.mediaUrl
                ? message.mediaUrl.startsWith("blob:")
                  ? message.mediaUrl
                  : (mediaUrl(message.mediaUrl) ?? message.mediaUrl)
                : null;
              const itemIndex = items.findIndex((item) => item.id === message.id);
              const g = stackTile(index, messages.length);
              return (
                <div
                  key={tileKey(message)}
                  data-tile-id={message.id}
                  className={cn(
                    "album-fan chat-media-frame relative shrink-0 snap-start overflow-hidden rounded-xl bg-secondary shadow-md transition-[width,height,margin,transform]",
                    EASE,
                  )}
                  style={{
                    "--tile-delay": `${index * 50}ms`,
                    width: `${expanded ? 7 : STACK_TILE_W}rem`,
                    height: `${expanded ? 9 : 6.5}rem`,
                    marginLeft: index === 0 ? 0 : `${expanded ? 0.375 : -(STACK_TILE_W - STACK_STEP)}rem`,
                    transform: expanded ? "none" : `translateY(${g.y}px) scale(${g.scale})`,
                    zIndex: expanded ? 1 : g.z,
                  } as CSSProperties}
                >
                  {src ? (
                    <button
                      type="button"
                      ref={hapticTrigger}
                      data-message-photo
                      aria-label={expanded ? `Открыть фото ${index + 1} из ${messages.length}` : `Развернуть альбом, ${messages.length} фото`}
                      className="block size-full"
                      onClick={() => {
                        if (!expanded) return toggle(true);
                        if (itemIndex >= 0) setViewer(itemIndex);
                      }}
                    >
                      <img src={src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                    </button>
                  ) : null}
                  {message.status === "sending" ? (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-background/35">
                      <span className="size-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-label="Загружается" />
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
                </div>
              );
            })}
          </div>
          {expanded ? (
            <button
              type="button"
              data-no-gesture
              onClick={() => toggle(false)}
              className="absolute left-1.5 top-1.5 z-30 inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur-sm"
            >
              <Minimize2 className="size-3" aria-hidden="true" /> Свернуть
            </button>
          ) : (
            <span className="pointer-events-none absolute right-1 top-0.5 z-30 inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur-sm">
              <Images className="size-3" aria-hidden="true" /> {messages.length}
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-30 flex flex-wrap items-center justify-between gap-1">
            {reaction ? <ReactionChips reactions={reaction} overlay /> : <span />}
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
      <GalleryViewer
        items={items}
        index={viewer}
        onIndex={(i) => { setConfirmDelete(false); setViewer(i); }}
        onClose={() => { setConfirmDelete(false); setViewer(null); }}
        {...(onReply || onDelete ? { extraActions: viewerActions } : {})}
      />
    </li>
  );
}
