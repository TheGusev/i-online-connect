import { CalendarDays, Check, MapPin, Users } from "lucide-react";

import type { SpaceEvent } from "@/api";
import { Button } from "@/components/ds";
import { formatEventDate } from "@/features/spaces/labels";

export function EventList({
  events,
  onToggleGoing,
  pending,
}: {
  events: SpaceEvent[];
  onToggleGoing: (event: SpaceEvent) => void;
  pending?: boolean | undefined;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Ближайших встреч пока нет. Организатор обычно объявляет их в чате сообщества за неделю.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li
          key={event.id}
          className="rounded-3xl border border-border bg-card p-5 shadow-soft transition-shadow duration-200 hover:shadow-lift"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-community-ink">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {formatEventDate(event.startsAt)}
              </p>
              <h3 className="mt-1.5 text-base font-bold text-foreground">{event.title}</h3>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden="true" />
                {event.place}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" />
                идут {event.goingCount}
              </p>
            </div>
            <Button
              variant={event.going ? "secondary" : "primary"}
              size="sm"
              loading={pending ?? false}
              onClick={() => onToggleGoing(event)}
              className={
                event.going
                  ? "text-community-ink"
                  : "bg-community text-community-foreground hover:bg-community/90"
              }
            >
              {event.going ? (
                <>
                  <Check aria-hidden="true" />
                  Иду
                </>
              ) : (
                "Пойду"
              )}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
