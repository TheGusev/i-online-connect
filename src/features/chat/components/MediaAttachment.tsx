/**
 * Фото и видео внутри пузыря сообщения.
 *
 * Фото открывается на весь экран по нажатию, видео проигрывается на месте —
 * так переписку не нужно покидать ради вложения.
 */
import { Play, X } from "lucide-react";
import { useState } from "react";

import { mediaUrl } from "@/api";
import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { ZoomablePhoto } from "./ZoomablePhoto";

function durationLabel(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function MediaAttachment({
  kind,
  src,
  durationMs,
  className,
}: {
  kind: "image" | "video";
  src: string;
  durationMs?: number | undefined;
  className?: string;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [playing, setPlaying] = useState(false);
  // blob:-предпросмотр отдаём как есть, серверный путь разворачиваем в абсолютный.
  const url = src.startsWith("blob:") ? src : (mediaUrl(src) ?? src);

  if (kind === "video") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-primary/25 bg-black/40",
          className,
        )}
      >
        <video
          src={url}
          controls={playing}
          playsInline
          preload="metadata"
          className="max-h-72 w-full max-w-full object-contain"
          onPlay={() => setPlaying(true)}
        />
        {!playing ? (
          <button
            type="button"
            aria-label="Воспроизвести видео"
            onClick={(event) => {
              const video = event.currentTarget.parentElement?.querySelector("video");
              setPlaying(true);
              void video?.play().catch(() => undefined);
            }}
            className="absolute inset-0 grid place-items-center bg-background/20"
          >
            <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
              <Play className="size-5" aria-hidden="true" />
            </span>
          </button>
        ) : null}
        {durationMs && !playing ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
            {durationLabel(durationMs)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setLightbox(true);
        }}
        aria-label="Открыть фото"
        className={cn(
          "block overflow-hidden rounded-2xl border border-primary/25",
          "[-webkit-touch-callout:none]",
          className,
        )}
      >
        <img
          src={url}
          alt="Вложение"
          loading="lazy"
          className="max-h-72 w-full max-w-full object-cover"
        />
      </button>
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото"
          className="fixed inset-0 z-[70] grid place-items-center bg-background/95 p-4 backdrop-blur"
        >
          <div className="size-full overflow-hidden rounded-2xl" data-no-gesture>
            <ZoomablePhoto src={url} className="rounded-2xl" />
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Закрыть"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] border-primary/40 text-primary"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </>
  );
}
