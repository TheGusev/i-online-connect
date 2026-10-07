import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Heart,
  MapPin,
  MessageCircle,
  SlidersHorizontal,
  Text,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { Listing } from "@/api";
import { Avatar, Button, MediaImage, TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";
import { useListing, useRespondToListing } from "@/features/nearby/hooks";
import { categoryLabel, formatDate, formatPrice, priceApplies } from "@/features/nearby/labels";
import { cn } from "@/lib/utils";

function SheetSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-background">
      <Button
        type="button"
        variant="ghost"
        fullWidth
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-auto justify-start rounded-none px-4 py-3"
      >
        <span className="text-primary">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
      </Button>
      {open ? (
        <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ListingGallery({ listing }: { listing: Listing }) {
  const [index, setIndex] = useState(0);
  if (listing.photos.length === 0) return null;
  return (
    <div className="relative -mx-5 overflow-hidden bg-secondary">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width > 0) setIndex(Math.round(event.currentTarget.scrollLeft / width));
        }}
      >
        {listing.photos.map((photo, photoIndex) => (
          <div key={`${photo}-${photoIndex}`} className="aspect-[4/3] w-full shrink-0 snap-center">
            <MediaImage
              src={photo}
              alt={`${listing.title}, фото ${photoIndex + 1}`}
              className="size-full object-cover"
              wrapperClassName="size-full"
            />
          </div>
        ))}
      </div>
      {listing.photos.length > 1 ? (
        <span className="absolute bottom-3 right-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold text-foreground">
          {index + 1} / {listing.photos.length}
        </span>
      ) : null}
    </div>
  );
}

export function ListingSheet({ listingId, onClose }: { listingId?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: listing, isPending, isError } = useListing(listingId ?? "", Boolean(listingId));
  const respond = useRespondToListing(listingId ?? "");
  const drag = useRef<{ y: number; current: number } | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!listingId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [listingId, onClose]);

  if (!listingId || typeof document === "undefined") return null;

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: event.clientY, current: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = Math.max(0, event.clientY - drag.current.y);
    drag.current.current = next;
    setOffset(next);
  };
  const pointerEnd = () => {
    const shouldClose = (drag.current?.current ?? 0) > 100;
    drag.current = null;
    setOffset(0);
    if (shouldClose) onClose();
  };

  const respondNow = () => {
    if (!listing) return;
    if (listing.respondedConversationId) {
      void navigate({ to: "/chat/$id", params: { id: listing.respondedConversationId } });
      return;
    }
    respond.mutate(undefined, {
      onSuccess: ({ conversationId }) => void navigate({ to: "/chat/$id", params: { id: conversationId } }),
      onError: (cause) => toast.error(cause instanceof Error ? cause.message : "Не удалось откликнуться"),
    });
  };

  return createPortal(
    <div className="viewport-overlay z-50 flex items-end justify-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Закрыть объявление"
        onClick={onClose}
        className="absolute inset-0 size-full rounded-none bg-foreground/35 p-0 hover:bg-foreground/35"
      />
      <article
        role="dialog"
        aria-modal="true"
        aria-label={listing?.title ?? "Объявление"}
        className="relative z-10 flex max-h-[92%] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl border border-border bg-card shadow-lift transition-transform"
        style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
      >
        <div
          className="touch-none px-5 pb-2 pt-3"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
          <p className="mt-3 truncate text-sm font-bold text-foreground">Объявление</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {isPending ? <p className="py-10 text-center text-sm text-muted-foreground">Загружаем объявление…</p> : null}
          {isError ? <p className="py-10 text-center text-sm text-destructive">Объявление недоступно</p> : null}
          {listing ? (
            <div className="space-y-4">
              <ListingGallery listing={listing} />
              <div>
                {priceApplies(listing.category) ? (
                  <p className="text-2xl font-black text-primary">{formatPrice(listing.priceMinor, listing.currency)}</p>
                ) : null}
                <h2 className="mt-1 text-2xl font-bold leading-tight text-foreground">{listing.title}</h2>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{[listing.city, listing.district].filter(Boolean).join(", ")}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden="true" />{formatDate(listing.createdAt)}</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden="true" />Откликов: {listing.responsesCount}</span>
              </div>

              <Link
                to="/u/$id"
                params={{ id: listing.author.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 transition-colors hover:bg-secondary"
              >
                <Avatar name={listing.author.name} src={listing.author.avatarUrl} size="md" verified={listing.author.trustLevel !== "new"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">{listing.author.name}</span>
                  <TrustBadge level={badgeLevel(listing.author.trustLevel)} size="sm" />
                </span>
                <span className="text-xs font-semibold text-primary">Витрина</span>
              </Link>

              <SheetSection icon={<Text aria-hidden="true" />} title="Описание">
                {listing.description || "Описание не добавлено"}
              </SheetSection>
              <SheetSection icon={<SlidersHorizontal aria-hidden="true" />} title="Параметры">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <dt>Категория</dt><dd className="text-right text-foreground">{categoryLabel(listing.category)}</dd>
                  {listing.district ? <><dt>Район</dt><dd className="text-right text-foreground">{listing.district}</dd></> : null}
                  <dt>Статус</dt><dd className="text-right text-foreground">{listing.state === "active" ? "Активно" : listing.state === "closed" ? "Завершено" : "Срок истёк"}</dd>
                </dl>
              </SheetSection>
            </div>
          ) : null}
        </div>

        {listing && !listing.isMine && !listing.isSeed ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <Button fullWidth loading={respond.isPending} disabled={listing.state !== "active"} onClick={respondNow}>
              <MessageCircle aria-hidden="true" />{listing.respondedConversationId ? "Перейти в диалог" : "Откликнуться"}
            </Button>
            <Button variant="secondary" disabled title="Избранное пока не поддерживается">
              <Heart aria-hidden="true" />В избранное
            </Button>
          </div>
        ) : null}
      </article>
    </div>,
    document.body,
  );
}