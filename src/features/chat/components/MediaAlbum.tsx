import { Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { mediaUrl, type GalleryItem, type Message } from "@/api";
import { cn } from "@/lib/utils";
import { tileKey } from "@/features/chat/albums";
import { useSessionStore } from "@/store/useSessionStore";

import { GalleryViewer } from "./MediaGallery";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Классы ячеек по числу видимых плиток: 2 рядом, 3 — большое слева, 4+ — сетка 2×2. */
function layout(count: number) {
  if (count === 2) return { grid: "grid-cols-2 aspect-[2/1]", cell: () => "" };
  if (count === 3)
    return { grid: "grid-cols-2 grid-rows-2 aspect-square", cell: (i: number) => (i === 0 ? "row-span-2" : "") };
  return { grid: "grid-cols-2 grid-rows-2 aspect-square", cell: () => "" };
}

/**
 * Альбом из нескольких фото: одна рамка, время и галочки одной плашкой,
 * плитки проявляются по очереди. Нажатие открывает полноэкранный просмотр всех фото.
 */
export function MediaAlbum({
  messages,
  authorName,
  onRetry,
}: {
  messages: Message[];
  authorName?: string | undefined;
  onRetry?: ((message: Message) => void) | undefined;
}) {
  const myId = useSessionStore((s) => s.user?.id);
  const [viewer, setViewer] = useState<number | null>(null);
  const last = messages[messages.length - 1]!;
  const mine = last.authorId === myId || last.authorId === "me";
  const visible = messages.slice(0, 4);
  const rest = messages.length - visible.length;
  const { grid, cell } = layout(visible.length);

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

  return (
    <li id={`message-${last.id}`} className={cn("album-in flex", mine ? "justify-end" : "justify-start")}>
      <div
        data-bubble
        data-no-swipe
        className={cn(
          "chat-media-frame relative grid w-[min(18rem,78%)] gap-[2px] overflow-hidden rounded-2xl bg-border",
          grid,
        )}
      >
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
              className={cn("album-tile relative min-h-0 overflow-hidden bg-secondary", cell(index))}
              style={{ "--tile-delay": `${index * 60}ms` } as CSSProperties}
            >
              {src ? (
                <button
                  type="button"
                  aria-label={`Открыть фото ${index + 1} из ${messages.length}`}
                  className="block size-full"
                  onClick={() => itemIndex >= 0 && setViewer(itemIndex)}
                >
                  <img src={src} alt="" loading="lazy" className="size-full object-cover" />
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
                  onClick={() => setViewer(Math.min(3, items.length - 1))}
                  className="absolute inset-0 grid place-items-center bg-background/60 text-2xl font-bold text-foreground"
                >
                  +{rest}
                </button>
              ) : null}
            </div>
          );
        })}
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
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
      </div>
      {viewer !== null ? (
        <GalleryViewer items={items} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      ) : null}
    </li>
  );
}
