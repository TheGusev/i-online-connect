import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, MessageCircle } from "lucide-react";

import type { Listing } from "@/api";
import { Card, Chip, TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";

import { categoryLabel, formatDate, formatPrice, priceApplies } from "../labels";

export function ListingCard({ listing }: { listing: Listing }) {
  const photo = listing.photos[0];

  return (
    <Card variant="space" className="flex h-full flex-col overflow-hidden p-0">
      <Link
        to="/nearby/$id"
        params={{ id: listing.id }}
        className="flex h-full flex-col focus-visible:outline-none"
      >
        {photo ? (
          <img
            src={photo}
            alt={listing.title}
            width={640}
            height={400}
            loading="lazy"
            className="h-44 w-full object-cover"
          />
        ) : null}

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="intent">
              {categoryLabel(listing.category)}
            </Chip>
            {priceApplies(listing.category) ? (
              <span className="text-sm font-bold">
                {formatPrice(listing.priceMinor, listing.currency)}
              </span>
            ) : null}
          </div>

          <h3 className="text-lg font-bold leading-snug">{listing.title}</h3>

          {listing.description ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {listing.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatDate(listing.createdAt)}
            </span>
            {listing.responsesCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                {listing.responsesCount}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <span className="truncate text-sm font-semibold">{listing.author.name}</span>
            <TrustBadge level={badgeLevel(listing.author.trustLevel)} size="sm" />
          </div>
        </div>
      </Link>
    </Card>
  );
}
