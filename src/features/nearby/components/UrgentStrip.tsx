import { Link } from "@tanstack/react-router";
import { Siren } from "lucide-react";

import { MediaImage } from "@/components/ds";

import { useListings } from "../hooks";
import { ListingCountdown } from "./ListingCountdown";

/** Полоса «Срочное рядом» над диалогами: 3–5 свежих срочных объявлений. Без данных не рендерится. */
export function UrgentStrip() {
  const { data } = useListings({ category: "urgent", limit: 5 });
  const items = (data?.items ?? []).filter((item) => item.state === "active").slice(0, 5);
  if (items.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <Siren className="size-3.5 text-primary" aria-hidden="true" />
        Срочное рядом
      </h2>
      <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((listing) => (
          <li key={listing.id} className="w-40 shrink-0">
            <Link
              to="/nearby"
              search={{ listing: listing.id }}
              className="relative block overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="h-20 bg-secondary">
                <MediaImage src={listing.photos[0]} alt={listing.title} className="size-full object-cover" wrapperClassName="size-full" />
              </div>
              <ListingCountdown expiresAt={listing.expiresAt} className="pointer-events-none absolute right-2 top-2" />
              <p className="line-clamp-2 p-2 text-xs font-semibold leading-snug">{listing.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
