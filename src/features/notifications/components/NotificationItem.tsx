import { Link } from "@tanstack/react-router";
import { Bell, CalendarDays, Heart, MessageCircle, MapPin, Trash2 } from "lucide-react";

import type { AppNotification } from "@/api";
import { cn } from "@/lib/utils";

import { describeNotification } from "../hooks";
import {
  NotificationBannerContent,
  toParts,
} from "./NotificationBannerContent";
import { useListing } from "@/features/nearby/hooks";
import { formatPrice } from "@/features/nearby/labels";

const kindIcons = {
  new_message: MessageCircle,
  space_event: CalendarDays,
  space_message_deleted: Trash2,
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
  const lot = useListing(listingId ?? "", item.kind === "urgent_final_call" && Boolean(listingId));
  const displayTitle = item.kind === "urgent_final_call" && lot.data?.currentPriceMinor != null
    ? `Скоро конец: цена сейчас ${formatPrice(lot.data.currentPriceMinor)}` : title;
  const Icon = kindIcons[item.kind as keyof typeof kindIcons] ?? Bell;
  const parts = toParts(displayTitle, description);
  const content = (
    <>
      <NotificationBannerContent
        parts={parts}
        avatarUrl={null}
        actorActivity={item.payload["actorActivity"]}
        kind={item.kind}
        visual={
          <span className="grid size-8 place-items-center rounded-full bg-secondary text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        }
      />
      <span className="gta-notification-card__meta">
        <time dateTime={item.createdAt}>
          {new Date(item.createdAt).toLocaleString("ru-RU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        {!item.readAt ? (
          <span className="gta-notification-card__unread">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Новое
          </span>
        ) : null}
      </span>
    </>
  );

  const className = cn(
    "gta-toast urgent-tile gta-notification-card",
    compact && "gta-notification-card--compact",
    !item.readAt && "gta-notification-card--unread",
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
    if (item.kind === "urgent_expired_relist") return <Link to="/nearby/new" search={{ category: "urgent", relist: listingId }} onClick={onPick} className={className}>{content}</Link>;
    if (item.kind.startsWith("urgent_")) return <Link to="/nearby" search={{ listing: listingId }} onClick={onPick} className={className}>{content}</Link>;
    return <Link to="/nearby/$id" params={{ id: listingId }} onClick={onPick} className={className}>{content}</Link>;
  }
  return <button type="button" onClick={onPick} className={className}>{content}</button>;
}