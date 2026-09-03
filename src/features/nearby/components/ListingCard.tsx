import { Link } from "@tanstack/react-router";
import { MapPin, MessageCircle } from "lucide-react";

import type { Listing } from "@/api";
import { Card, MediaImage, TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";

import { categoryLabel, formatDate, formatPrice, priceApplies } from "../labels";

/**
 * Компактная карточка объявления: фото слева, текст справа.
 *
 * Так на экран телефона попадает 4–5 объявлений вместо одного — раздел
 * читается как лента объявлений, а не как галерея. Цена — самый заметный
 * элемент: именно её ищут глазами в первую очередь.
 */
export function ListingCard({ listing }: { listing: Listing }) {
  const photo = listing.photos[0];
  const place = [listing.city, listing.district].filter(Boolean).join(", ");

  return (
    <Card variant="space" className="overflow-hidden p-0">
      <Link
        to="/nearby/$id"
        params={{ id: listing.id }}
        className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-3 p-2.5 focus-visible:outline-none sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4 sm:p-3"
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary">
          <MediaImage
            src={photo}
            alt={listing.title}
            className="size-full object-cover"
            wrapperClassName="size-full"
          />
          {listing.isSeed ? (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
              пример
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1 py-0.5">
          {priceApplies(listing.category) ? (
            <span className="text-base font-black leading-none sm:text-lg">
              {formatPrice(listing.priceMinor, listing.currency)}
            </span>
          ) : (
            <span className="text-xs font-bold uppercase tracking-wide text-primary">
              {categoryLabel(listing.category)}
            </span>
          )}

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
            {listing.title}
          </h3>

          {listing.description ? (
            <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground sm:line-clamp-2">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-auto flex min-w-0 items-center gap-2 pt-1 text-[11px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{place || "Город не указан"}</span>
            </span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{formatDate(listing.createdAt)}</span>
            {listing.responsesCount > 0 ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1">
                <MessageCircle className="size-3" aria-hidden="true" />
                {listing.responsesCount}
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
            <span className="truncate font-semibold">{listing.author.name}</span>
            <TrustBadge level={badgeLevel(listing.author.trustLevel)} size="sm" />
          </div>
        </div>
      </Link>
    </Card>
  );
}
