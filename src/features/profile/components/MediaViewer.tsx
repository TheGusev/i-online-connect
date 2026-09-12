import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ProfileMedia } from "@/api";
import { mediaUrl } from "@/api";
import { MediaImage } from "@/components/ds";

/**
 * Просмотр кадра на весь экран: тап по фото открывает его целиком,
 * свайп и стрелки переключают, Esc или крестик закрывают.
 */
export function MediaViewer({
  media,
  name,
  index,
  onIndexChange,
  onClose,
}: {
  media: ProfileMedia[];
  name: string;
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const total = media.length;
  const item = media[index];
  const touchStart = useRef<number | null>(null);

  const go = (delta: number) => {
    if (total < 2) return;
    onIndexChange((index + delta + total) % total);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // Фон под просмотром не должен прокручиваться.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  });

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — просмотр фото`}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const end = event.changedTouches[0]?.clientX;
        touchStart.current = null;
        if (start === null || end === undefined) return;
        const delta = start - end;
        if (Math.abs(delta) > 40) go(delta > 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          className="grid size-10 place-items-center rounded-full border border-border bg-card shadow-soft"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {item.kind === "video" ? (
          <video
            src={mediaUrl(item.url)}
            controls
            autoPlay
            playsInline
            className="max-h-full w-full rounded-2xl object-contain"
          />
        ) : (
          <MediaImage
            src={item.url}
            alt={`${name} — кадр ${index + 1} из ${total}`}
            className="max-h-full w-full rounded-2xl object-contain"
          />
        )}
      </div>

      {total > 1 ? (
        <div className="flex items-center justify-center gap-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Предыдущий кадр"
            className="grid size-11 place-items-center rounded-full border border-border bg-card shadow-soft"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Следующий кадр"
            className="grid size-11 place-items-center rounded-full border border-border bg-card shadow-soft"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
