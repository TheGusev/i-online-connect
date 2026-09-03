import { Link, createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";

import type { NeedCategory } from "@/api";
import { Button, Card, Input, SpaceCardSkeleton } from "@/components/ds";
import { AppShell } from "@/components/layout/AppShell";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { CategoryChips } from "@/features/nearby/components/CategoryChips";
import { ListingCard } from "@/features/nearby/components/ListingCard";
import { categories } from "@/features/nearby/labels";
import { useListings } from "@/features/nearby/hooks";
import { useSessionStore } from "@/store/useSessionStore";

export const Route = createFileRoute("/nearby/")({
  head: () => ({
    meta: [
      { title: "Рядом: объявления, услуги и помощь в вашем городе — Я Онлайн" },
      {
        name: "description",
        content:
          "Продажа, услуги, совместный досуг, попутчики и помощь по-соседски — от подтверждённых людей в вашем городе.",
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
  const authed = useSessionStore((state) => state.status === "authed");
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
    authed,
  );

  const items = data?.items ?? [];

  return (
    <AppShell wide public>
      <header className="mb-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
          <MapPin className="size-3.5" aria-hidden="true" />
          Рядом
        </p>
        <WaveHeading as="h1" className="mt-3 text-3xl font-bold tracking-tight">
          Быстрые решения рядом с домом
        </WaveHeading>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Продать или отдать вещь, найти мастера, компанию на вечер, попутчика или просто попросить
          помощи по-соседски. Люди те же, что и в знакомствах, — с тем же уровнем доверия.
        </p>
      </header>

      {!authed ? (
        <Card className="mb-8 p-6">
          <h2 className="text-lg font-bold">Войдите, чтобы видеть объявления в вашем городе</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            «Рядом» показывает объявления людей из вашего города — поэтому нужен профиль с городом.
            Регистрация занимает пару минут: диалог с AI-помощником вместо длинной анкеты.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {categories.map(({ id, label, hint, icon: Icon }) => (
              <li key={id} className="flex items-start gap-3 rounded-2xl bg-secondary/50 p-4">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/onboarding">Создать профиль</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/auth">У меня уже есть аккаунт</Link>
            </Button>
          </div>
        </Card>
      ) : (
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
                hint={data?.city ? `Сейчас показываем: ${data.city}` : "По умолчанию — из профиля"}
              />
              <Input
                label="Поиск по объявлениям"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setLimit(PAGE);
                }}
              />
              <Button asChild className="sm:mt-1">
                <Link to="/nearby/new">
                  <Plus aria-hidden="true" />
                  Разместить
                </Link>
              </Button>
            </div>

            <CategoryChips
              value={category}
              onChange={(next) => {
                setCategory(next);
                setLimit(PAGE);
              }}
            />
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
              <Button asChild className="mt-4">
                <Link to="/nearby/new">Разместить объявление</Link>
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
    </AppShell>
  );
}
