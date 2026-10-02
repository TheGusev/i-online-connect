/**
 * Галерея всех фото и видео диалога или сообщества.
 *
 * Открывается поверх чата, чтобы не терять позицию в переписке. Данные
 * подгружаются страницами при прокрутке и обновляются при каждом открытии.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Images, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chatApi, mediaUrl, spacesApi } from "@/api";
import type { GalleryItem } from "@/api";
import { cn } from "@/lib/utils";

type Scope = "conversation" | "space";
type Filter = "all" | "image" | "video";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "image", label: "Фото" },
  { value: "video", label: "Видео" },
];

function durationLabel(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function useMediaGallery(scope: Scope, id: string, filter: Filter, enabled: boolean) {
  const kind = filter === "all" ? undefined : filter;
  return useInfiniteQuery({
    queryKey: ["gallery", scope, id, filter],
    queryFn: ({ pageParam }) =>
      scope === "conversation"
        ? chatApi.getConversationMedia(id, kind, pageParam)
        : spacesApi.getSpaceMedia(id, kind, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 0,
  });
}

/** Кнопка в шапке чата. */
export function MediaGalleryButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Фото и видео"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border border-primary/40 text-primary transition-[background-color,box-shadow] hover:bg-primary/10 active:shadow-glow",
        className,
      )}
    >
      <Images className="size-5" aria-hidden="true" />
    </button>
  );
}

export function MediaGallery({
  scope,
  id,
  open,
  onClose,
}: {
  scope: Scope;
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const gallery = useMediaGallery(scope, id, filter, open);
  const items = gallery.data?.pages.flatMap((page) => page.items) ?? [];
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !gallery.hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !gallery.isFetchingNextPage) void gallery.fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [gallery, items.length]);

  useEffect(() => {
    if (!open) setViewIndex(null);
  }, [open]);

  if (!open) return null;

  const showInChat = (item: GalleryItem) => {
    setViewIndex(null);
    onClose();
    requestAnimationFrame(() => {
      const node = document.getElementById(`message-${item.id}`);
      node?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Фото и видео" className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <h2 className="hud-title flex-1">Фото и видео</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть галерею"
          className="grid size-10 place-items-center rounded-full border border-primary/40 text-primary"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="flex gap-2 px-4 py-3" role="tablist">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              filter === option.value
                ? "border-primary bg-primary text-primary-foreground shadow-glow"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[env(safe-area-inset-bottom)]">
        {gallery.isPending ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-md bg-card" />
            ))}
          </div>
        ) : gallery.isError ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Не удалось загрузить галерею.</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Здесь появятся фото и видео из переписки</p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {items.map((item, index) => {
              const url = mediaUrl(item.mediaUrl) ?? item.mediaUrl;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setViewIndex(index)}
                  aria-label={item.kind === "video" ? "Открыть видео" : "Открыть фото"}
                  className="relative aspect-square overflow-hidden rounded-md border border-primary/15 bg-card"
                >
                  {item.kind === "video" ? (
                    <>
                      <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid size-8 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-glow">
                          <Play className="size-4" aria-hidden="true" />
                        </span>
                      </span>
                      {item.durationMs ? (
                        <span className="absolute bottom-1 right-1 rounded-full bg-background/80 px-1.5 text-[10px] font-semibold tabular-nums">
                          {durationLabel(item.durationMs)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <img src={url} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div ref={sentinel} className="h-8" />
      </div>

      {viewIndex !== null && items[viewIndex] ? (
        <GalleryViewer
          items={items}
          index={viewIndex}
          onIndex={setViewIndex}
          onClose={() => setViewIndex(null)}
          onShowInChat={showInChat}
        />
      ) : null}
    </div>
  );
}

function GalleryViewer({
  items,
  index,
  onIndex,
  onClose,
  onShowInChat,
}: {
  items: GalleryItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onShowInChat: (item: GalleryItem) => void;
}) {
  const item = items[index]!;
  const url = mediaUrl(item.mediaUrl) ?? item.mediaUrl;
  const touchX = useRef<number | null>(null);
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < items.length - 1 && onIndex(index + 1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") prev();
      if (event.key === "ArrowRight") next();
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur"
      onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        const end = event.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null || Math.abs(end - start) < 50) return;
        if (end < start) next(); else prev();
      }}
    >
      <header className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.authorName}</p>
          <p className="text-xs text-muted-foreground">{dateLabel(item.createdAt)} · {index + 1} из {items.length}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-10 place-items-center rounded-full border border-primary/40 bg-card text-primary">
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="relative grid min-h-0 flex-1 place-items-center p-3">
        {item.kind === "video" ? (
          <video key={item.id} src={url} controls playsInline autoPlay className="max-h-full max-w-full rounded-2xl" />
        ) : (
          <img key={item.id} src={url} alt="Вложение" className="max-h-full max-w-full rounded-2xl object-contain" />
        )}
        {index > 0 ? (
          <button type="button" onClick={prev} aria-label="Предыдущее" className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-primary/40 bg-card text-primary sm:grid">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : null}
        {index < items.length - 1 ? (
          <button type="button" onClick={next} aria-label="Следующее" className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-primary/40 bg-card text-primary sm:grid">
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2">
        <button
          type="button"
          onClick={() => onShowInChat(item)}
          className="rounded-full border border-primary/50 px-5 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          Показать в чате
        </button>
      </div>
    </div>
  );
}
