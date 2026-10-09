import { Link } from "@tanstack/react-router";
import { BadgeCheck, CalendarDays, MapPin, Users } from "lucide-react";

import { mediaUrl, type Space } from "@/api";
import { ClockTimer } from "@/components/ClockTimer";
import { Chip, MediaImage } from "@/components/ds";
import {
  cadenceLabels,
  formatEventDate,
  formatLabels,
  formatMembers,
  formatSpaceAge,
} from "@/features/spaces/labels";
import { useMinutesUntil } from "@/features/nearby/components/ListingCountdown";
import { cn } from "@/lib/utils";
import { SpaceSubscribe } from "./SpaceSubscribe";

/** Таймер до ближайшей встречи: в днях, а за сутки — ЧЧ:ММ.
 *  Встреча идёт или её нет — ничего не показываем. */
function EventCountdown({ startsAt, className }: { startsAt?: string; className?: string }) {
  const minutes = useMinutesUntil(startsAt ?? "");
  if (minutes <= 0 || !Number.isFinite(minutes)) return null;
  if (minutes < 24 * 60) {
    return <ClockTimer minutes={minutes} {...(className ? { className } : {})} />;
  }
  const days = Math.floor(minutes / (24 * 60));
  return (
    <span
      aria-label={`До встречи ${days} дн.`}
      className={cn(
        "font-mono text-base font-bold leading-none tabular-nums text-primary [text-shadow:0_0_8px_var(--color-primary)]",
        className,
      )}
    >
      {days} дн
    </span>
  );
}

export function SpaceCard({ space }: { space: Space }) {
  return (
    <Link
      to="/spaces/$id"
      params={{ id: space.id }}
      className="group block h-full min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-community focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <MediaImage
          src={space.coverUrl}
          alt={space.title}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {space.verifiedCommunity ? (
          <span className="absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-community px-2 py-1 text-[9px] font-semibold leading-none text-community-foreground shadow-soft sm:text-[10px]">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            <span className="truncate">Проверено</span>
          </span>
        ) : null}
        {space.isMember ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-card/90 px-2 py-1 text-[9px] font-semibold leading-none text-community-ink backdrop-blur sm:text-[10px]">
            Участник
          </span>
        ) : null}
      </div>

      <div className="relative space-y-2 p-2.5 sm:p-3">
        <EventCountdown
          {...(space.nextEvent ? { startsAt: space.nextEvent.startsAt } : {})}
          className="pointer-events-none absolute right-2.5 top-3 z-10 text-xs sm:right-3 sm:text-sm"
        />
        <div>
          <h3 className="line-clamp-2 min-h-9 break-words pr-12 text-sm font-bold leading-[1.15] text-foreground sm:text-base">{space.title}</h3>
          <p className="mt-1 line-clamp-2 min-h-8 break-words text-[11px] leading-4 text-muted-foreground sm:text-xs">
            {space.description}
          </p>
        </div>

        <div className="space-y-1 text-[10px] text-muted-foreground sm:text-xs">
          <span className="flex min-w-0 items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" />
            <span className="truncate">{formatMembers(space.membersCount)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" />
            <span className="truncate">{space.city} · {space.distanceKm} км</span>
          </span>
          <span className="block truncate">
            {formatLabels[space.format]} · {cadenceLabels[space.cadence].toLowerCase()}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
          <span className="truncate">{formatSpaceAge(space.createdAt)}</span>
          <SpaceSubscribe space={space} />
        </div>

        {space.nextEvent ? (
          <div className="flex min-w-0 items-start gap-1.5 rounded-lg bg-community-soft p-2 text-[10px] leading-4 text-community-ink sm:text-xs">
            <CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 break-words">
              <span className="font-semibold">{formatEventDate(space.nextEvent.startsAt)}</span>{" — "}
              {space.nextEvent.title}, {space.nextEvent.place}
            </span>
          </div>
        ) : (
          <p className="line-clamp-2 text-[10px] leading-4 text-muted-foreground sm:text-xs">Ближайшая встреча пока не назначена</p>
        )}

        {space.interests.length > 0 ? (
          <div className="flex min-w-0 gap-1 overflow-hidden">
            {space.interests.slice(0, 2).map((interest) => (
              <Chip key={interest} variant="outline" size="sm" className="min-w-0 max-w-full px-2 text-[9px] sm:text-[10px]">
                <span className="truncate">{interest}</span>
                {interest}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
