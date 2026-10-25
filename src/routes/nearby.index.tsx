import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus, Search, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import type { NeedCategory } from "@/api";
import { Button, Input, SpaceCardSkeleton } from "@/components/ds";
import { AppShell } from "@/components/layout/AppShell";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { CategoryChips } from "@/features/nearby/components/CategoryChips";
import { ListingCard } from "@/features/nearby/components/ListingCard";
import { ListingSheet } from "@/features/nearby/components/ListingSheet";
import { useListings } from "@/features/nearby/hooks";
import { useAuthGate } from "@/features/auth/phone/AuthSheet";
import { initialCategory } from "@/features/nearby/category-selection";
import { DatingLockSheet } from "@/features/nearby/components/DatingLockSheet";
import { useMyProfile } from "@/features/profile/hooks";
import { useSessionStore } from "@/store/useSessionStore";
import { scrollUnderHeader } from "@/features/nearby/scroll-to";
import { unreservedUrgent } from "@/features/nearby/urgent-ui";

/** Поиск переживает переход между вкладками свайпом. */
let rememberedQuery = "";

export const Route = createFileRoute("/nearby/")({
  validateSearch: (search: Record<string, unknown>): { listing?: string } =>
    typeof search["listing"] === "string" ? { listing: search["listing"] } : {},
  head: () => ({
    meta: [
      { title: "Рядом: объявления, услуги и помощь в вашем городе — Я Онлайн" },
      {
        name: "description",
        content:
          "Срочные задачи, услуги, покупка и продажа, жильё и помощь — от подтверждённых людей в вашем городе.",
      },
      { property: "og:title", content: "Рядом: объявления и помощь в вашем городе — Я Онлайн" },
      {
        property: "og:description",
        content: "Живые объявления от людей рядом: услуги, вещи, попутчики и помощь.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NearbyPage,
});

const PAGE = 20;

function NearbyPage() {
  const { listing } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<NeedCategory | null>(initialCategory);
  const [q, setQRaw] = useState(rememberedQuery);
  const setQ = (value: string) => {
    rememberedQuery = value;
    setQRaw(value);
  };
  const [limit, setLimit] = useState(PAGE);

  const { data, isPending, isError } = useListings(
    {
      city: city.trim() || undefined,
      category: category ?? undefined,
      q: q.trim() || undefined,
      limit,
    },
    true,
  );
  const gate = useAuthGate();
  const authed = useSessionStore((state) => state.status === "authed");
  const me = useMyProfile(authed);
  const completeness = me.data?.completeness;
  const datingOpen = authed && completeness?.complete === true;
  const [lockOpen, setLockOpen] = useState(false);

  const items = category === "urgent" ? unreservedUrgent(data?.items ?? []) : data?.items ?? [];
  const postRef = useRef<HTMLDivElement>(null);
  const goPost = () =>
    gate.guard(() =>
      void navigate({ to: "/nearby/new", search: category ? { category } : {} }),
    );

  return (
    <AppShell wide public>
      <header className="mb-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-ink">
          <MapPin className="size-3.5" aria-hidden="true" />
          РЯДОМ
        </p>
        <WaveHeading as="h1" className="mt-3 text-3xl font-bold">
          Быстрые решения рядом с домом
        </WaveHeading>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Продать или отдать вещь, найти мастера, компанию на вечер, попутчика или просто попросить
          помощи по-соседски. Люди те же, что и в знакомствах, — с тем же уровнем доверия.
        </p>
      </header>

      {(
        <>
          <div className="mb-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                <Input
                  label="Город"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setLimit(PAGE);
                  }}
                  hint={`Сейчас показываем: ${data?.city || "все города"}`}
                />
                <Input
                  label="Поиск по объявлениям"
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setLimit(PAGE);
                  }}
                />
              <div ref={postRef} className="sm:mt-1">
                <Button className="w-full sm:w-auto" onClick={goPost}>
                  <Plus aria-hidden="true" />
                  Разместить
                </Button>
              </div>
            </div>

            <CategoryChips
              layout="grid"
              value={category}
              locked={datingOpen ? [] : ["dating"]}
              onLocked={() => setLockOpen(true)}
              onChange={(next) => {
                setCategory(next);
                setLimit(PAGE);
                if (postRef.current) scrollUnderHeader(postRef.current);
              }}
            />

          </div>

          <div
            key={category ?? "all"}
            className="listing-crossfade min-h-[calc(var(--vvh,100dvh)-8rem)]"
          >
          {isError ? (
            <p className="text-sm text-destructive">Не удалось загрузить объявления.</p>
          ) : null}

          {isPending ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <SpaceCardSkeleton />
              <SpaceCardSkeleton />
              <SpaceCardSkeleton />
              <SpaceCardSkeleton />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center">
              <Search className="mx-auto size-6 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold">
                {category
                  ? "В этой категории пока пусто — станьте первым"
                  : "Пока нет объявлений в вашем городе — станьте первым"}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Первое объявление задаёт тон разделу: напишите просто и по-человечески, что нужно
                или что вы предлагаете.
              </p>
              <Button className="mt-4" onClick={goPost}>
                Разместить объявление
              </Button>
            </div>
          ) : (
            <>
              {/* Список, а не галерея: на телефоне видно сразу несколько
                  объявлений, на широком экране — две колонки. */}
              <ul className="grid gap-3 lg:grid-cols-2">
                {items.map((listing, index) => (
                  <Reveal as="li" key={listing.id} delay={index * 50}>
                    <ListingCard listing={listing} />
                  </Reveal>
                ))}
              </ul>

              {items.length >= limit ? (
                <div className="mt-8 text-center">
                  <Button variant="secondary" onClick={() => setLimit((prev) => prev + PAGE)}>
                    <Sparkles aria-hidden="true" />
                    Показать ещё
                  </Button>
                </div>
              ) : null}
            </>
          )}
          </div>
        </>
      )}
      {gate.sheet}
      <DatingLockSheet
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        completeness={completeness}
        guest={!authed}
        onFill={() => {
          setLockOpen(false);
          if (authed) void navigate({ to: "/profile/me", search: { edit: true } });
          else gate.guard(() => setLockOpen(true));
        }}
      />
      <ListingSheet
        {...(listing ? { listingId: listing } : {})}
        onClose={() => void navigate({ search: {}, replace: true })}
      />
    </AppShell>
  );
}
