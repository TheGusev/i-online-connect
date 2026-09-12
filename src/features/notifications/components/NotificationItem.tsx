import { Link } from "@tanstack/react-router";
import { Bell, CalendarDays, Heart, MessageCircle, MapPin } from "lucide-react";

import type { AppNotification } from "@/api";
import { cn } from "@/lib/utils";

import { describeNotification } from "../hooks";

const kindIcons = {
  new_message: MessageCircle,
  space_event: CalendarDays,
  match: Heart,
  listing_match: MapPin,
  listing_response: MapPin,
} as const;

export function NotificationItem({
  item,
  onPick,
  compact = false,
}: {
  item: AppNotification;
  onPick: () => void;
  compact?: boolean;
}) {
  const { title, description, href, conversationId, profileId, spaceId, eventId, listingId } =
    describeNotification(item);
  const Icon = kindIcons[item.kind as keyof typeof kindIcons] ?? Bell;
  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 grid shrink-0 place-items-center rounded-full bg-secondary text-primary",
          compact ? "size-8" : "size-10",
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-foreground">{title}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-foreground/80">{description}</span>
        ) : null}
        <span className="mt-1 block text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString("ru-RU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </span>
      {!item.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary shadow-glow" /> : null}
    </>
  );
  const className = cn(
    "flex w-full items-start gap-3 rounded-2xl text-left transition-colors hover:bg-secondary",
    compact ? "px-3 py-2" : "px-4 py-3",
    !item.readAt && "bg-primary-soft/45",
  );

  if (conversationId && href?.startsWith("/chat/")) {
    return <Link to="/chat/$id" params={{ id: conversationId }} onClick={onPick} className={className}>{content}</Link>;
  }
  if (profileId && href?.startsWith("/profile/")) {
    return <Link to="/profile/$id" params={{ id: profileId }} onClick={onPick} className={className}>{content}</Link>;
  }
  if (spaceId && href?.startsWith("/spaces/")) {
    return (
      <Link
        to="/spaces/$id"
        params={{ id: spaceId }}
        search={eventId ? { eventId } : {}}
        onClick={onPick}
        className={className}
      >
        {content}
      </Link>
    );
  }
  if (listingId && href?.startsWith("/nearby/")) {
    return <Link to="/nearby/$id" params={{ id: listingId }} onClick={onPick} className={className}>{content}</Link>;
  }
  return <button type="button" onClick={onPick} className={className}>{content}</button>;
}