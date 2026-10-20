import { Link, useNavigate } from "@tanstack/react-router";
import { useAuthGate } from "@/features/auth/phone/AuthSheet";
import {
  CalendarDays,
  ChevronDown,
  Heart,
  MapPin,
  MessageCircle,
  SlidersHorizontal,
  Text,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { mediaUrl, type Listing } from "@/api";
import { Button, Skeleton } from "@/components/ds";
import { useListing, useRespondToListing } from "@/features/nearby/hooks";
import { categoryLabel, formatDate, formatPrice, priceApplies } from "@/features/nearby/labels";
import { cn } from "@/lib/utils";

import { ListingAuthor } from "./ListingAuthor";
import { MediaViewer } from "@/features/profile/components/MediaViewer";
import { ListingCountdown } from "./ListingCountdown";

const LEAVE_MS = 260;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Секция с плавным раскрытием; после раскрытия лист доводит её в зону видимости. */
function SheetSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next) {
        window.setTimeout(
          () => ref.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }),
          230,
        );
      }
      return next;
    });
  };
  return (
    <section ref={ref} className="scroll-mb-4 overflow-hidden rounded-2xl border border-border bg-background">
      <Button
        type="button"
        variant="ghost"
        fullWidth
        aria-expanded={open}
        onClick={toggle}
        className="h-auto justify-start rounded-none px-4 py-3"
      >
        <span className="text-primary">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={cn("transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </Button>
      <div className="collapse-grid" data-open={open}>
        <div>
          <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function FadeImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={mediaUrl(src) ?? src}
      alt={alt}
      data-loaded={loaded}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      className="img-fade size-full object-cover"
    />
  );
}

function ListingGallery({ listing }: { listing: Listing }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  if (listing.photos.length === 0) return null;
  const media = listing.photos.map((url, i) => ({ id: `${listing.id}-${i}`, kind: "photo" as const, url }));
  return (
    <div className="relative -mx-5 overflow-hidden bg-secondary">
      {viewer !== null
        ? createPortal(
            <MediaViewer media={media} name={listing.title} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} />,
            document.body,
          )
        : null}
      <div
        data-no-swipe className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width > 0) setIndex(Math.round(event.currentTarget.scrollLeft / width));
        }}
      >
        {listing.photos.map((photo, photoIndex) => (
          <div
            key={`${photo}-${photoIndex}`}
            className="aspect-[16/10] max-h-[38vh] w-full shrink-0 cursor-zoom-in snap-center"
            onClick={() => setViewer(photoIndex)}
          >
            <FadeImage src={photo} alt={`${listing.title}, фото ${photoIndex + 1}`} />
          </div>
        ))}
      </div>
      {listing.photos.length > 1 ? (
        <span className="absolute bottom-3 right-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold text-foreground">
          {index + 1} / {listing.photos.length}
        </span>
      ) : null}
      {listing.photos.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden="true">
          {listing.photos.map((_, i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-primary" : "w-1.5 bg-foreground/50")} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function stateLabel(state: Listing["state"]) {
  return state === "active" ? "Активно" : state === "closed" ? "Завершено" : "Срок истёк";
}

function ListingParams({ listing }: { listing: Listing }) {
  const rows: Array<[string, ReactNode]> = [
    ["Категория", categoryLabel(listing.category)],
    ["Город", listing.city],
    ...(listing.district ? ([["Район", listing.district]] as Array<[string, ReactNode]>) : []),
    ...(priceApplies(listing.category)
      ? ([["Цена", formatPrice(listing.priceMinor, listing.currency)]] as Array<[string, ReactNode]>)
      : []),
    ["Статус", stateLabel(listing.state)],
    ...(listing.state === "active"
      ? ([
          ["Осталось", <ListingCountdown key="left" expiresAt={listing.expiresAt} />],
          [
            "Действует до",
            new Date(listing.expiresAt).toLocaleString("ru-RU", {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            }),
          ],
        ] as Array<[string, ReactNode]>)
      : []),
    ["Размещено", formatDate(listing.createdAt)],
    ["Откликов", listing.responsesCount],
    ["Фото", listing.photos.length],
    ...(listing.isSeed ? ([["Тип", "Пример объявления"]] as Array<[string, ReactNode]>) : []),
  ];
  const visible = rows.filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (visible.length === 0) return null;
  return (
    <SheetSection icon={<SlidersHorizontal aria-hidden="true" />} title="Параметры">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {visible.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="text-right text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </SheetSection>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-4" aria-label="Загружаем объявление">
      <Skeleton className="-mx-5 aspect-[16/10] max-h-[38vh] rounded-none" />
      <Skeleton className="h-8 w-2/5" />
      <Skeleton className="h-7 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-12 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

export function ListingSheet({ listingId, onClose }: { listingId?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const gate = useAuthGate();
  const { data: listing, isPending, isError } = useListing(listingId ?? "", Boolean(listingId));
  const respond = useRespondToListing(listingId ?? "");
  const drag = useRef<{ y: number; current: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => setLeaving(false), [listingId]);

  const requestClose = useCallback(() => {
    if (reducedMotion()) {
      onClose();
      return;
    }
    setLeaving(true);
    window.setTimeout(onClose, LEAVE_MS);
  }, [onClose]);

  useEffect(() => {
    if (!listingId) return;
    const unlock = lockBodyScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [listingId, requestClose]);

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
    if (shouldClose) {
      requestClose();
      return;
    }
    setOffset(0);
  };

  const respondAuthed = () => {
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
  const respondNow = () => gate.guard(respondAuthed);

  return (
    <>
      {createPortal(
        <div className="viewport-overlay z-50 flex items-end justify-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть объявление"
            onClick={requestClose}
            className={cn(
              "absolute inset-0 size-full rounded-none bg-foreground/35 p-0 hover:bg-foreground/35",
              leaving ? "backdrop-leave" : "backdrop-enter",
            )}
          />
          <article
            role="dialog"
            aria-modal="true"
            aria-label={listing?.title ?? "Объявление"}
            className={cn(
              "relative z-10 flex max-h-[92%] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl border border-border bg-card shadow-lift",
              leaving ? "sheet-leave" : "sheet-enter",
              !leaving && !drag.current && "transition-transform duration-200",
            )}
            style={
              leaving
                ? ({ "--sheet-from": `${offset}px` } as CSSProperties)
                : { transform: offset ? `translateY(${offset}px)` : undefined }
            }
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

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
              {isPending ? <SheetSkeleton /> : null}
              {isError ? (
                <p className="py-10 text-center text-sm text-destructive">Объявление недоступно</p>
              ) : null}
              {listing ? (
                <div className="sheet-stagger space-y-3">
                  <ListingGallery listing={listing} />
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      {priceApplies(listing.category) ? (
                        <p className="text-2xl font-black text-primary">
                          {formatPrice(listing.priceMinor, listing.currency)}
                        </p>
                      ) : (
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">
                          {categoryLabel(listing.category)}
                        </p>
                      )}
                      {listing.state === "active" ? (
                        <ListingCountdown expiresAt={listing.expiresAt} className="mt-1.5" />
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-xl font-bold leading-tight text-foreground">{listing.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden="true" />
                        {[listing.city, listing.district].filter(Boolean).join(", ")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {formatDate(listing.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        Откликов: {listing.responsesCount}
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/u/$id"
                    params={{ id: listing.author.id }}
                    className="block rounded-2xl border border-border bg-background p-3 transition-colors hover:bg-secondary"
                  >
                    <ListingAuthor
                      author={listing.author}
                      full
                      trailing={<span className="text-xs font-semibold text-primary">Витрина</span>}
                    />
                  </Link>

                  <SheetSection icon={<Text aria-hidden="true" />} title="Описание" defaultOpen>
                    <p className="whitespace-pre-wrap">{listing.description || "Описание не добавлено"}</p>
                  </SheetSection>
                  <ListingParams listing={listing} />
                </div>
              ) : null}
            </div>

            {listing && !listing.isMine && !listing.isSeed ? (
              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <Button fullWidth loading={respond.isPending} disabled={listing.state !== "active"} onClick={respondNow}>
                  <MessageCircle aria-hidden="true" />
                  {listing.respondedConversationId ? "Написать" : "Откликнуться"}
                </Button>
                <Button variant="secondary" disabled title="Избранное пока не поддерживается">
                  <Heart aria-hidden="true" />В избранное
                </Button>
              </div>
            ) : null}
          </article>
        </div>,
        document.body,
      )}
      {gate.sheet}
    </>
  );
}
