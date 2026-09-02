import { Link } from "@tanstack/react-router";
import { BadgeCheck, CalendarDays, MapPin, Users } from "lucide-react";

import { mediaUrl, type Space } from "@/api";
import { Chip } from "@/components/ds";
import {
  cadenceLabels,
  formatEventDate,
  formatLabels,
  formatMembers,
} from "@/features/spaces/labels";

export function SpaceCard({ space }: { space: Space }) {
  return (
    <Link
      to="/spaces/$id"
      params={{ id: space.id }}
      className="group block overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-community focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[16/7] overflow-hidden bg-muted">
        <img
          src={mediaUrl(space.coverUrl)}
          alt={space.title}
          loading="lazy"
          width={1024}
          height={640}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {space.verifiedCommunity ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-community px-3 py-1 text-xs font-semibold text-community-foreground shadow-soft">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Проверенное сообщество
          </span>
        ) : null}
        {space.isMember ? (
          <span className="absolute right-3 top-3 rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-community-ink backdrop-blur">
            Вы участник
          </span>
        ) : null}
      </div>

      <div className="space-y-3 p-5">
        <div>
          <h3 className="text-lg font-bold leading-snug text-foreground">{space.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {space.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true" />
            {formatMembers(space.membersCount)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden="true" />
            {space.city} · {space.distanceKm} км
          </span>
          <span>
            {formatLabels[space.format]} · {cadenceLabels[space.cadence].toLowerCase()}
          </span>
        </div>

        {space.nextEvent ? (
          <div className="flex items-start gap-2 rounded-2xl bg-community-soft px-3.5 py-2.5 text-xs text-community-ink">
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">{formatEventDate(space.nextEvent.startsAt)}</span>
              {" — "}
              {space.nextEvent.title}, {space.nextEvent.place}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ближайшая встреча пока не назначена</p>
        )}

        {space.interests.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {space.interests.map((interest) => (
              <Chip key={interest} variant="outline" size="sm">
                {interest}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
