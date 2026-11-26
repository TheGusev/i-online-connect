import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import type { Listing } from "@/api";
import { Button, MediaImage } from "@/components/ds";
import { RailEmpty, RailSection } from "@/components/layout/DesktopRail";
import { useListings } from "@/features/nearby/hooks";
import { urgentListings } from "@/features/nearby/urgent-ui";
import { useSessionStore } from "@/store/useSessionStore";

import { categoryLabel, formatPrice, priceApplies } from "../labels";
import { ListingCountdown } from "./ListingCountdown";

function ListingRow({ listing, timer = false }: { listing: Listing; timer?: boolean }) {
  const priced = listing.urgentType === "sell" || priceApplies(listing.category);
  return (
    <Link
      to="/nearby"
      search={{ listing: listing.id }}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-2 transition-colors hover:border-primary/40"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-secondary">
        <MediaImage
          src={listing.photos[0]}
          alt={listing.title}
          className="size-full object-cover"
          wrapperClassName="size-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{listing.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {priced
            ? formatPrice(listing.currentPriceMinor ?? listing.priceMinor, listing.currency)
            : categoryLabel(listing.category)}
          {listing.district ? ` · ${listing.district}` : ""}
        </p>
      </div>
      {timer ? <ListingCountdown expiresAt={listing.expiresAt} /> : null}
    </Link>
  );
}

/** Правая панель объявлений на широком экране: срочные сделки и свежие публикации города. */
export function NearbyRail({ city }: { city: string }) {
  const authed = useSessionStore((state) => state.status === "authed");
  const urgent = useListings(
    { city: city.trim() || undefined, category: "urgent", limit: 8 },
    true,
  );
  const recent = useListings({ city: city.trim() || undefined, limit: 12 }, true);
  const urgentItems = urgentListings(urgent.data?.items ?? []).slice(0, 4);
  const recentItems = [...(recent.data?.items ?? [])]
    .filter((listing) => listing.state === "active" && listing.category !== "urgent")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {authed ? (
        <Button fullWidth asChild>
          <Link to="/nearby/new" search={{}}>
            <Plus aria-hidden="true" />
            Разместить объявление
          </Link>
        </Button>
      ) : null}

      <RailSection title="Срочные сделки">
        {urgentItems.length === 0 ? (
          <RailEmpty>Срочных сделок сейчас нет.</RailEmpty>
        ) : (
          <ul className="space-y-2">
            {urgentItems.map((listing) => (
              <li key={listing.id}>
                <ListingRow listing={listing} timer />
              </li>
            ))}
          </ul>
        )}
      </RailSection>

      <RailSection title="Свежее рядом">
        {recentItems.length === 0 ? (
          <RailEmpty>Новых объявлений пока нет.</RailEmpty>
        ) : (
          <ul className="space-y-2">
            {recentItems.map((listing) => (
              <li key={listing.id}>
                <ListingRow listing={listing} />
              </li>
            ))}
          </ul>
        )}
      </RailSection>
    </div>
  );
}
