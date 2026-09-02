import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Compass, Plus, Users } from "lucide-react";

import type { SpaceDraft } from "@/api";
import { AppShell } from "@/components/layout/AppShell";
import { Button, SpaceCardSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { CreateSpaceForm } from "@/features/spaces/components/CreateSpaceForm";
import { SpaceCard } from "@/features/spaces/components/SpaceCard";
import { SpacesTabs, type SpacesTab } from "@/features/spaces/components/SpacesTabs";
import { useCreateSpace, useSpaces } from "@/features/spaces/hooks";

export const Route = createFileRoute("/spaces/")({
  head: () => ({
    meta: [
      { title: "Spaces: сообщества и совместные активности — Я Онлайн" },
      {
        name: "description",
        content:
          "Пробежки, настолки, книжный клуб и профессиональные круги: пространства, где знакомство начинается с общего дела.",
      },
      { property: "og:title", content: "Spaces: сообщества и совместные активности — Я Онлайн" },
      {
        property: "og:description",
        content: "Найдите сообщество рядом или создайте своё — с событиями и общим чатом.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpacesPage,
});

function SpacesPage() {
  const [tab, setTab] = useState<SpacesTab>("nearby");
  const { data: spaces, isPending, isError } = useSpaces();
  const createSpace = useCreateSpace();
  const navigate = useNavigate();

  const list = (spaces ?? []).filter((space) => {
    if (tab === "mine") return space.isMember;
    return true;
  });

  const sorted =
    tab === "nearby"
      ? [...list].sort((a, b) => a.distanceKm - b.distanceKm)
      : tab === "interests"
        ? [...list].sort((a, b) => b.membersCount - a.membersCount)
        : list;

  const handleCreate = (draft: SpaceDraft) => {
    createSpace.mutate(draft, {
      onSuccess: (space) => {
        void navigate({ to: "/spaces/$id", params: { id: space.id } });
      },
      // Раньше ошибка сервера уходила в пустоту: форма просто «не работала».
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Не удалось создать пространство");
      },
    });
  };

  return (
    <AppShell wide>
      <header className="mb-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-community-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-community-ink">
          <Users className="size-3.5" aria-hidden="true" />
          Spaces
        </p>
        <WaveHeading as="h1" className="mt-3 text-3xl font-bold tracking-tight">
          Общие дела, а не переписка
        </WaveHeading>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Здесь люди собираются вокруг занятий: пробежки, настолки, прогулки, профессиональные
          круги. Это не лента знакомств — знакомства случаются сами, по ходу дела.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SpacesTabs
          value={tab}
          onChange={(next) => {
            setTab(next);
          }}
        />
        {tab !== "create" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTab("create")}
            className="text-community-ink"
          >
            <Plus aria-hidden="true" />
            Создать пространство
          </Button>
        ) : null}
      </div>

      {tab === "create" ? (
        <Reveal className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-xl font-bold">Новое пространство</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Опишите, что вы собираетесь делать вместе — этого достаточно, чтобы к вам пришли первые
            участники.
          </p>
          <CreateSpaceForm onSubmit={handleCreate} submitting={createSpace.isPending} />
        </Reveal>
      ) : (
        <>
          {tab === "nearby" ? (
            <p className="mb-4 text-xs text-muted-foreground">
              Сначала — сообщества, которые собираются ближе всего к вам.
            </p>
          ) : null}

          {isError ? (
            <p className="text-sm text-destructive">Не удалось загрузить пространства.</p>
          ) : null}

          {isPending ? (
            <div className="grid gap-5 md:grid-cols-2">
              <SpaceCardSkeleton />
              <SpaceCardSkeleton />
              <SpaceCardSkeleton />
              <SpaceCardSkeleton />
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center">
              <Compass className="mx-auto size-6 text-community" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold">Вы пока никуда не вступили</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Загляните в «Рядом» — или создайте своё пространство вокруг того, чем вам нравится
                заниматься.
              </p>
              <Button
                className="mt-4 bg-community text-community-foreground hover:bg-community/90"
                onClick={() => setTab("nearby")}
              >
                Посмотреть, что рядом
              </Button>
            </div>
          ) : (
            <ul className="grid gap-5 md:grid-cols-2">
              {sorted.map((space, index) => (
                <Reveal as="li" key={space.id} delay={index * 60}>
                  <SpaceCard space={space} />
                </Reveal>
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
