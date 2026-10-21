import { useEffect, useState } from "react";

import { chatApi } from "@/api";
import type { LinkPreview } from "@/api/endpoints/chat";
import { cn } from "@/lib/utils";

// Кэш на уровне модуля: одна и та же ссылка в разных сообщениях не дёргает сервер повторно.
const cache = new Map<string, LinkPreview | null>();

function useLinkPreview(url: string | null): LinkPreview | null {
  const [preview, setPreview] = useState<LinkPreview | null>(url ? (cache.get(url) ?? null) : null);
  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) {
      setPreview(cache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    chatApi
      .getLinkPreview(url)
      .then((data) => {
        cache.set(url, data);
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        cache.set(url, null);
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return preview;
}

/** Компактная карточка предпросмотра ссылки под текстом сообщения. */
export function LinkPreviewCard({ url, mine = false }: { url: string; mine?: boolean }) {
  const preview = useLinkPreview(url);
  if (!preview) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "mt-2 flex items-stretch gap-2 overflow-hidden rounded-2xl border text-left",
        mine
          ? "border-primary-foreground/25 bg-primary-foreground/10"
          : "border-border bg-secondary/60",
      )}
    >
      {preview.image ? (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          className="h-14 w-14 shrink-0 object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="flex min-w-0 flex-col justify-center gap-0.5 py-1.5 pr-2.5">
        <span
          className={cn(
            "line-clamp-2 text-xs font-semibold leading-snug",
            mine ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {preview.title}
        </span>
        <span
          className={cn(
            "truncate text-[11px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {preview.domain}
        </span>
      </span>
    </a>
  );
}
