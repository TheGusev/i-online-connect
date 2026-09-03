import { Play, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ProfileMedia } from "@/api";
import { mediaUrl } from "@/api";
import { MediaImage } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * Каскадная карусель фото (coverflow).
 *
 * Центральный кадр крупный и резкий, соседние — меньше, темнее и уведены
 * в глубину. Свайп переключает, тап по боковому кадру делает его центральным.
 * Под каруселью — компактные точки, а не крупные миниатюры: так профиль
 * занимает вдвое меньше экрана.
 */
export function MediaCoverflow({
  media,
  name,
  onUpload,
  onDelete,
  onPrimary,
  uploadDisabled,
  uploadHint,
  progress,
  busy,
  className,
}: {
  media: ProfileMedia[];
  name: string;
  /** Передан — карусель своя: появляется «+» и управление кадрами. */
  onUpload?: (file: File) => void;
  onDelete?: (id: string) => void;
  onPrimary?: (id: string) => void;
  uploadDisabled?: boolean;
  uploadHint?: string;
  /** Проценты текущей загрузки, null — загрузки нет. */
  progress?: number | null;
  busy?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const total = media.length;
  const own = Boolean(onUpload);

  useEffect(() => {
    if (index > total - 1) setIndex(Math.max(0, total - 1));
  }, [index, total]);

  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = media[safeIndex];

  const go = (delta: number) => {
    if (total < 2) return;
    setIndex((prev) => (prev + delta + total) % total);
  };

  const uploadButton = own ? (
    <label
      className={cn(
        "absolute bottom-3 right-3 z-20 grid size-11 place-items-center rounded-full border border-border bg-card shadow-soft",
        uploadDisabled || busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
      title={uploadHint ?? "Добавить фото"}
      aria-label={uploadHint ?? "Добавить фото"}
    >
      <input
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        disabled={uploadDisabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload?.(file);
          event.target.value = "";
        }}
      />
      {progress !== null && progress !== undefined ? (
        <span className="text-[11px] font-bold text-primary">{progress}%</span>
      ) : (
        <Plus className="size-5 text-primary" aria-hidden="true" />
      )}
    </label>
  ) : null;

  if (!current) {
    return (
      <div
        className={cn(
          "relative grid aspect-[4/5] w-full max-w-sm place-items-center rounded-[2rem] border border-dashed border-border bg-secondary px-6 text-center text-sm text-muted-foreground",
          "mx-auto",
          className,
        )}
      >
        {own ? "Добавьте первое фото — с ним профиль оживает" : "Фото пока нет"}
        {uploadButton}
      </div>
    );
  }

  return (
    <div className={cn("select-none", className)}>
      <div
        className="relative mx-auto flex h-[19rem] w-full items-center justify-center overflow-hidden sm:h-[24rem]"
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
        {media.map((item, position) => {
          const offset = position - safeIndex;
          if (Math.abs(offset) > 2) return null;
          const isCenter = offset === 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={
                isCenter
                  ? `${name} — кадр ${position + 1} из ${total}`
                  : `Показать кадр ${position + 1}`
              }
              aria-current={isCenter}
              onClick={() => (isCenter ? undefined : setIndex(position))}
              className="absolute left-1/2 top-1/2 h-full w-[58%] max-w-[17rem] overflow-hidden rounded-[1.75rem] border border-border bg-secondary shadow-soft transition-all duration-300 ease-out sm:w-[52%]"
              style={{
                transform: `translate(-50%, -50%) translateX(${offset * 62}%) scale(${isCenter ? 1 : Math.abs(offset) === 1 ? 0.82 : 0.68})`,
                zIndex: 10 - Math.abs(offset),
                opacity: Math.abs(offset) === 2 ? 0.35 : 1,
              }}
            >
              {item.kind === "video" ? (
                <video
                  src={mediaUrl(item.url)}
                  controls={isCenter}
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
              ) : (
                <MediaImage
                  src={item.url}
                  alt={`${name} — кадр ${position + 1} из ${total}`}
                  className="size-full object-cover"
                />
              )}

              {!isCenter ? (
                <span
                  className="pointer-events-none absolute inset-0 bg-foreground/25"
                  aria-hidden="true"
                />
              ) : null}

              {item.kind === "video" ? (
                <span className="pointer-events-none absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-background/85 backdrop-blur">
                  <Play className="size-3.5" aria-hidden="true" />
                </span>
              ) : item.isPrimary ? (
                <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                  <Star className="size-3 text-primary" aria-hidden="true" />
                  Главное
                </span>
              ) : null}
            </button>
          );
        })}

        {uploadButton}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {media.map((item, position) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Кадр ${position + 1}`}
            aria-current={position === safeIndex}
            onClick={() => setIndex(position)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              position === safeIndex ? "w-5 bg-primary" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>

      {own ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          {current.kind === "photo" && !current.isPrimary && onPrimary ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPrimary(current.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-semibold shadow-soft disabled:opacity-60"
            >
              <Star className="size-3.5 text-primary" aria-hidden="true" />
              Сделать главным
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(current.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-semibold text-destructive shadow-soft disabled:opacity-60"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Удалить кадр
            </button>
          ) : null}
          {uploadHint ? <span className="text-muted-foreground">{uploadHint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
