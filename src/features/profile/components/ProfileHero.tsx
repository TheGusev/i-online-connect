import { MapPin, PlayCircle, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ProfileMedia } from "@/api";
import { mediaUrl } from "@/api";
import { MediaImage, TrustBadge, type TrustLevel } from "@/components/ds";
import { cn } from "@/lib/utils";

import { MediaViewer } from "./MediaViewer";

/**
 * Шапка профиля в духе карточки из ленты: крупный кадр во всю ширину,
 * поверх него имя, возраст и город, сверху — бейдж доверия и метка видео.
 *
 * Тап по кадру открывает его на весь экран, свайп листает. Для своего профиля
 * управление кадрами живёт компактными иконками в правом нижнем углу, чтобы
 * страница не разъезжалась строкой кнопок.
 */
export function ProfileHero({
  media,
  name,
  age,
  city,
  trustLevel,
  onUpload,
  onDelete,
  onPrimary,
  uploadDisabled,
  uploadHint,
  progress,
  busy,
}: {
  media: ProfileMedia[];
  name: string;
  age: number;
  city: string;
  trustLevel: TrustLevel;
  /** Передан — шапка своя: появляется «+» и управление кадром. */
  onUpload?: (file: File) => void;
  onDelete?: (id: string) => void;
  onPrimary?: (id: string) => void;
  uploadDisabled?: boolean;
  uploadHint?: string;
  progress?: number | null;
  busy?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const touchStart = useRef<number | null>(null);
  const total = media.length;
  const own = Boolean(onUpload);

  useEffect(() => {
    if (index > total - 1) setIndex(Math.max(0, total - 1));
  }, [index, total]);

  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = media[safeIndex];
  const hasVideo = media.some((item) => item.kind === "video");

  const go = (delta: number) => {
    if (total < 2) return;
    setIndex((prev) => (prev + delta + total) % total);
  };

  const iconButton =
    "grid size-9 place-items-center rounded-full border border-border bg-card/90 shadow-soft backdrop-blur disabled:opacity-60";

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div
        className="relative"
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
        {current ? (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label={`${name} — открыть кадр ${safeIndex + 1} из ${total} на весь экран`}
            className="block w-full"
          >
            {current.kind === "video" ? (
              <video
                src={mediaUrl(current.url)}
                playsInline
                muted
                preload="metadata"
                className="aspect-[4/5] w-full object-cover sm:aspect-[3/2]"
              />
            ) : (
              <MediaImage
                src={current.url}
                alt={`${name} — кадр ${safeIndex + 1} из ${total}`}
                className="aspect-[4/5] w-full object-cover sm:aspect-[3/2]"
                wrapperClassName="aspect-[4/5] sm:aspect-[3/2]"
              />
            )}
          </button>
        ) : (
          <div className="grid aspect-[4/5] w-full place-items-center bg-secondary px-6 text-center text-sm text-muted-foreground sm:aspect-[3/2]">
            {own ? "Добавьте первое фото — с ним профиль оживает" : "Фото пока нет"}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {hasVideo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur">
              <PlayCircle className="size-3.5" aria-hidden="true" />
              Видео-визитка
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-full bg-card/95 shadow-soft backdrop-blur">
            <TrustBadge level={trustLevel} size="sm" />
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 via-foreground/30 to-transparent p-4 pt-10">
          <h1 className="truncate text-2xl font-bold text-primary-foreground sm:text-3xl">
            {name}
            {age ? `, ${age}` : ""}
          </h1>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="inline-flex min-w-0 items-center gap-1.5 text-xs text-primary-foreground/85">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{city}</span>
            </p>
            {total > 1 ? (
              <span className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                {media.map((item, position) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Кадр ${position + 1}`}
                    aria-current={position === safeIndex}
                    onClick={() => setIndex(position)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      position === safeIndex
                        ? "w-5 bg-primary"
                        : "w-1.5 bg-primary-foreground/60",
                    )}
                  />
                ))}
              </span>
            ) : null}
          </div>
        </div>

        {own ? (
          <div className="absolute right-3 top-14 flex flex-col items-end gap-2">
            <label
              className={cn(
                iconButton,
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
                <span className="text-[10px] font-bold text-primary">{progress}%</span>
              ) : (
                <Plus className="size-4 text-primary" aria-hidden="true" />
              )}
            </label>

            {current && current.kind === "photo" && !current.isPrimary && onPrimary ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPrimary(current.id)}
                title="Сделать главным фото"
                aria-label="Сделать главным фото"
                className={iconButton}
              >
                <Star className="size-4 text-primary" aria-hidden="true" />
              </button>
            ) : null}

            {current && onDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(current.id)}
                title="Удалить кадр"
                aria-label="Удалить кадр"
                className={cn(iconButton, "text-destructive")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {viewerOpen && current ? (
        <MediaViewer
          media={media}
          name={name}
          index={safeIndex}
          onIndexChange={setIndex}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </section>
  );
}
