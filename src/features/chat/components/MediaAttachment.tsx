/**
 * Фото и видео внутри пузыря сообщения.
 *
 * Фото открывается на весь экран по нажатию, видео проигрывается на месте —
 * так переписку не нужно покидать ради вложения.
 */
import { Play } from "lucide-react";
import { useState, type ReactNode } from "react";

import { mediaUrl } from "@/api";
import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { GalleryViewer } from "./MediaGallery";

function durationLabel(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function MediaAttachment({
  kind,
  src,
  durationMs,
  className,
  message,
  overlay,
  overlayStart,
}: {
  kind: "image" | "video";
  src: string;
  durationMs?: number | undefined;
  className?: string;
  message?: import("@/api").GalleryItem;
  /** Время и галочки поверх вложения справа внизу. */
  overlay?: ReactNode;
  /** Слева в той же нижней строке, что и время (реакция). */
  overlayStart?: ReactNode;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const badge = overlay ? (
    <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex flex-wrap items-center justify-between gap-1">
      {overlayStart ?? <span />}
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
        {overlay}
      </span>
    </span>
  ) : null;
  const [playing, setPlaying] = useState(false);
  // blob:-предпросмотр отдаём как есть, серверный путь разворачиваем в абсолютный.
  const url = src.startsWith("blob:") ? src : (mediaUrl(src) ?? src);

  if (kind === "video") {
    return (
      <div
        className={cn(
          "chat-media-frame chat-media-glow relative overflow-hidden rounded-2xl bg-secondary",
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
        {!playing ? badge : null}
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
          <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
            {durationLabel(durationMs)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        data-message-photo
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setLightbox(true);
        }}
        aria-label="Открыть фото"
        className={cn(
          "chat-media-frame chat-media-glow relative block h-auto overflow-hidden rounded-2xl bg-secondary p-0 hover:bg-secondary",
          "[-webkit-touch-callout:none]",
          className,
        )}
      >
        {!loaded ? <span className="absolute inset-0 animate-pulse bg-secondary" aria-hidden="true" /> : null}
        <img
          src={url}
          alt="Вложение"
          loading="lazy"
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className="img-fade block min-h-32 max-h-72 w-full max-w-full object-cover"
        />
        {badge}
      </Button>
      {lightbox ? (
        <GalleryViewer
          items={[message ?? { id: "attachment", kind: "image", mediaUrl: url, authorId: "", authorName: "", createdAt: new Date().toISOString() }]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </>
  );
}
