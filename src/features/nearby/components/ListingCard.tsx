import { Link } from "@tanstack/react-router";
import { MapPin, MessageCircle } from "lucide-react";

import type { Listing } from "@/api";
import { Card, MediaImage } from "@/components/ds";
import { ListingAuthor } from "./ListingAuthor";
import { ListingCountdown } from "./ListingCountdown";
import { UrgentPrice } from "./UrgentDeal";

import { categoryLabel, formatDate, formatPrice, priceApplies } from "../labels";

/**
 * Компактная карточка объявления: фото слева, текст справа.
 * Сверху — автор и таймер в одной строке, дальше цена/категория и заголовок.
 */
export function ListingCard({ listing }: { listing: Listing }) {
  const photo = listing.photos[0];
  const place = [listing.city, listing.district].filter(Boolean).join(", ");
  const timed = listing.state === "active" || listing.state === "expired";

  return (
    <Card variant="space" className="listing-press overflow-hidden p-0">
      <Link
        to="/nearby"
        search={{ listing: listing.id }}
        className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 p-2.5 focus-visible:outline-none sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4 sm:p-3"
      >
        <div className="relative size-[6.5rem] shrink-0 overflow-hidden rounded-2xl bg-secondary sm:size-[8.5rem]">
          <MediaImage
            src={photo}
            alt={listing.title}
            className="size-full object-cover"
            wrapperClassName="size-full"
          />
          {listing.photos.length > 1 ? (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-background/85 px-1.5 py-0.5 text-[9px] font-bold text-foreground backdrop-blur">
              1/{listing.photos.length}
            </span>
          ) : null}
          {listing.isSeed ? (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
              пример
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <ListingAuthor
            author={listing.author}
            trailing={timed ? <ListingCountdown expiresAt={listing.expiresAt} /> : null}
          />

          {listing.urgentType === "sell" ? <UrgentPrice listing={listing} compact /> : priceApplies(listing.category) ? (
            <span className="mt-0.5 text-base font-black leading-none sm:text-lg">
              {formatPrice(listing.priceMinor, listing.currency)}
            </span>
          ) : (
            <span className="mt-0.5 text-xs font-bold uppercase tracking-wide text-primary">
              {categoryLabel(listing.category)}
            </span>
          )}

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
            {listing.title}
          </h3>

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
        </div>
      </Link>
    </Card>
  );
}
