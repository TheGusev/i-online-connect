import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { mediaUrl } from "@/api";
import { cn } from "@/lib/utils";

/**
 * Картинка пользователя с мягкой заглушкой: если файл не отдался,
 * вместо «битого» значка браузера показываем спокойный плейсхолдер.
 */
export function MediaImage({
  src,
  alt,
  className,
  wrapperClassName,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const resolved = failed ? undefined : mediaUrl(src);

  if (!resolved) {
    return (
      <div
        className={cn(
          "grid size-full place-items-center bg-secondary text-muted-foreground",
          wrapperClassName,
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="size-6" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
