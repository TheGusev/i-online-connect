import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useState } from "react";

import type { ProfileMedia } from "@/api";
import { cn } from "@/lib/utils";

/** Крупный блок медиа с прокруткой нескольких фото/видео. */
export function MediaCarousel({
  media,
  name,
  className,
}: {
  media: ProfileMedia[];
  name: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const total = media.length;
  const current = media[Math.min(index, total - 1)];

  if (!current) return null;

  const go = (delta: number) => setIndex((prev) => (prev + delta + total) % total);

  return (
    <div className={cn("relative overflow-hidden rounded-[2rem] bg-secondary", className)}>
      <div className="aspect-[4/5] w-full sm:aspect-[16/10]">
        <img
          src={current.url}
          alt={`${name} — медиа ${index + 1} из ${total}`}
          className="size-full object-cover transition-opacity duration-500"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-foreground/55 to-transparent" />

      {current.kind === "video" ? (
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-xs font-semibold backdrop-blur">
          <Play className="size-3.5" aria-hidden="true" />
          Видео-интро
        </span>
      ) : null}

      {total > 1 ? (
        <>
          <button
            type="button"
            aria-label="Предыдущее медиа"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Следующее медиа"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
            {media.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Медиа ${itemIndex + 1}`}
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  itemIndex === index ? "w-8 bg-background" : "w-1.5 bg-background/60",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
