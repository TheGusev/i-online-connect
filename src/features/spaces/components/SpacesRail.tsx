import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

import type { Space } from "@/api";
import { MediaImage } from "@/components/ds";
import { RailEmpty, RailSection } from "@/components/layout/DesktopRail";
import { useSpaces } from "@/features/spaces/hooks";
import { formatEventDate, formatMembers } from "@/features/spaces/labels";

function eventTime(space: Space) {
  return space.nextEvent ? Date.parse(space.nextEvent.startsAt) : Number.POSITIVE_INFINITY;
}

function SpaceRow({ space, note }: { space: Space; note: string }) {
  return (
    <Link
      to="/spaces/$id"
      params={{ id: space.id }}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-2 transition-colors hover:border-community/40"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-secondary">
        <MediaImage
          src={space.coverUrl}
          alt={space.title}
          className="size-full object-cover"
          wrapperClassName="size-full"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{space.title}</p>
        <p className="truncate text-xs text-muted-foreground">{note}</p>
      </div>
    </Link>
  );
}

/** Правая панель сообществ на широком экране: ближайшие встречи, мои круги, популярные. */
export function SpacesRail() {
  const { data: spaces = [] } = useSpaces();
  const now = Date.now();
  const upcoming = spaces
    .filter((space) => eventTime(space) > now && Number.isFinite(eventTime(space)))
    .sort((a, b) => eventTime(a) - eventTime(b))
    .slice(0, 5);
  const mine = spaces.filter((space) => space.isMember).slice(0, 6);
  const popular = spaces
    .filter((space) => !space.isMember)
    .sort((a, b) => b.membersCount - a.membersCount)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <RailSection title="Ближайшие встречи">
        {upcoming.length === 0 ? (
          <RailEmpty>Назначенных встреч пока нет.</RailEmpty>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((space) => (
              <li key={space.id}>
                <Link
                  to="/spaces/$id"
                  params={{ id: space.id }}
                  className="block rounded-2xl bg-community-soft p-3 text-community-ink transition-opacity hover:opacity-90"
                >
                  <span className="flex items-start gap-2 text-xs">
                    <CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {space.nextEvent ? formatEventDate(space.nextEvent.startsAt) : ""}
                      </span>
                      <span className="block truncate">{space.nextEvent?.title}</span>
                      <span className="block truncate opacity-80">
                        {space.title}
                        {space.nextEvent?.place ? ` · ${space.nextEvent.place}` : ""}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </RailSection>

      <RailSection title="Мои сообщества">
        {mine.length === 0 ? (
          <RailEmpty>Вы пока никуда не вступили. Выберите круг слева.</RailEmpty>
        ) : (
          <ul className="space-y-2">
            {mine.map((space) => (
              <li key={space.id}>
                <SpaceRow space={space} note={formatMembers(space.membersCount)} />
              </li>
            ))}
          </ul>
        )}
      </RailSection>

      {popular.length > 0 ? (
        <RailSection title="Популярные">
          <ul className="space-y-2">
            {popular.map((space) => (
              <li key={space.id}>
                <SpaceRow
                  space={space}
                  note={`${formatMembers(space.membersCount)} · ${space.city}`}
                />
              </li>
            ))}
          </ul>
        </RailSection>
      ) : null}
    </div>
  );
}
