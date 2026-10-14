import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";

import type { NeedCategory } from "@/api";
import { Button, SpaceCardSkeleton } from "@/components/ds";
import { AppShell } from "@/components/layout/AppShell";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { CategoryChips } from "@/features/nearby/components/CategoryChips";
import { ListingCard } from "@/features/nearby/components/ListingCard";
import { ListingSheet } from "@/features/nearby/components/ListingSheet";
import { useListings } from "@/features/nearby/hooks";
import { useAuthGate } from "@/features/auth/phone/AuthSheet";

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
  const [category, setCategory] = useState<NeedCategory | null>(null);
  const [q, setQ] = useState("");
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

  const items = data?.items ?? [];

  return (
    <AppShell wide public>
      <header className="mb-4">
        <WaveHeading as="h1" className="text-2xl font-bold tracking-tight">
          Срочные объявления и услуги рядом
        </WaveHeading>
      </header>

      {(
        <>
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <label className="flex h-10 w-[7.5rem] shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 focus-within:border-primary">
                <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">Город</span>
                <input
                  value={city}
                  placeholder={data?.city ?? "Город"}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setLimit(PAGE);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-foreground"
                />
              </label>
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 focus-within:border-primary">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Поиск по объявлениям</span>
                <input
                  value={q}
                  placeholder="Поиск"
                  onChange={(event) => {
                    setQ(event.target.value);
                    setLimit(PAGE);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>

            <CategoryChips
              value={category}
              onChange={(next) => {
                setCategory(next);
                setLimit(PAGE);
              }}
            />

            <Button size="sm" variant="secondary" onClick={() => gate.guard(() => void navigate({ to: "/nearby/new" }))}>
              <Plus aria-hidden="true" />
              Разместить
            </Button>
          </div>

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
                Пока нет объявлений в вашем городе — станьте первым
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Первое объявление задаёт тон разделу: напишите просто и по-человечески, что нужно
                или что вы предлагаете.
              </p>
              <Button className="mt-4" onClick={() => gate.guard(() => void navigate({ to: "/nearby/new" }))}>
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
        </>
      )}
      {gate.sheet}
      <ListingSheet
        {...(listing ? { listingId: listing } : {})}
        onClose={() => void navigate({ search: {}, replace: true })}
      />
    </AppShell>
  );
}
