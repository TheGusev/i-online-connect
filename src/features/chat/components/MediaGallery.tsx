/**
 * Галерея всех фото и видео диалога или сообщества.
 *
 * Открывается поверх чата, чтобы не терять позицию в переписке. Данные
 * подгружаются страницами при прокрутке и обновляются при каждом открытии.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Images, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const showInChat = (item: GalleryItem) => {
    setViewIndex(null);
    onClose();
    requestAnimationFrame(() => {
      const node = document.getElementById(`message-${item.id}`);
      node?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Фото и видео" className="fixed inset-0 z-[90] flex flex-col overflow-y-auto overscroll-contain bg-background">
      <div className="sticky top-0 z-10 bg-background">
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
      </div>
      <div className="flex-1 px-1 pb-[env(safe-area-inset-bottom)]">
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
    </div>,
    document.body,
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const [pull, setPull] = useState(0);

  const goTo = (target: number, smooth = true) => {
    const track = trackRef.current;
    if (!track || target < 0 || target >= items.length) return;
    track.scrollTo({ left: target * track.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };
  const prev = () => goTo(index - 1);
  const next = () => goTo(index + 1);

  // Открываем сразу на нужном слайде без анимации.
  useEffect(() => { goTo(index, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") prev();
      if (event.key === "ArrowRight") next();
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const progress = Math.min(1, pull / 300);

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col"
      style={{ backgroundColor: `color-mix(in oklab, var(--background) ${Math.round((1 - progress * 0.7) * 100)}%, transparent)` }}
    >
      <header className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]" style={{ opacity: 1 - progress }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.authorName}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{dateLabel(item.createdAt)} · {index + 1} из {items.length}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-10 place-items-center rounded-full border border-primary/40 bg-card text-primary">
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <div
          ref={trackRef}
          className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-contain scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
          style={{
            transform: pull ? `translateY(${pull}px) scale(${1 - progress * 0.25})` : undefined,
            transition: pull ? undefined : "transform 260ms cubic-bezier(.22,1,.36,1)",
          }}
          onScroll={(event) => {
            const track = event.currentTarget;
            const nextIndex = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
            if (nextIndex !== index && nextIndex >= 0 && nextIndex < items.length) onIndex(nextIndex);
          }}
          onTouchStart={(event) => {
            const t = event.touches[0];
            drag.current = t ? { x: t.clientX, y: t.clientY, axis: null } : null;
          }}
          onTouchMove={(event) => {
            const d = drag.current;
            const t = event.touches[0];
            if (!d || !t) return;
            const dx = t.clientX - d.x;
            const dy = t.clientY - d.y;
            if (!d.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) d.axis = dy > Math.abs(dx) ? "y" : "x";
            if (d.axis === "y") setPull(Math.max(0, dy));
          }}
          onTouchEnd={() => {
            const closing = drag.current?.axis === "y" && pull > 120;
            drag.current = null;
            if (closing) onClose(); else setPull(0);
          }}
        >
          {items.map((slide, i) => {
            const near = Math.abs(i - index) <= 1;
            const src = mediaUrl(slide.mediaUrl) ?? slide.mediaUrl;
            return (
              <div key={slide.id} className="grid h-full w-full shrink-0 snap-center snap-always place-items-center p-3">
                {!near ? null : slide.kind === "video" ? (
                  i === index ? (
                    <video src={src} controls playsInline autoPlay className="max-h-full max-w-full rounded-2xl" />
                  ) : (
                    <video src={src} preload="metadata" playsInline muted className="max-h-full max-w-full rounded-2xl" />
                  )
                ) : (
                  <img
                    src={src}
                    alt="Вложение"
                    draggable={false}
                    onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "")}
                    className="gallery-img max-h-full max-w-full rounded-2xl object-contain"
                  />
                )}
              </div>
            );
          })}
        </div>
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
      <div className="flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2" style={{ opacity: 1 - progress }}>
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
