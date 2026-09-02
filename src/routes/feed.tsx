import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { DailyMatch } from "@/api";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileCardSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { FeedEmptyState } from "@/features/matching/components/FeedEmptyState";
import { FirstMessageSheet } from "@/features/matching/components/FirstMessageSheet";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { RefreshCountdown } from "@/features/matching/components/RefreshCountdown";
import { useCandidateReaction, useDailyFeed } from "@/features/matching/hooks";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Твои совпадения на сегодня — Я Онлайн" },
      {
        name: "description",
        content:
          "Ограниченная дневная подборка людей с объяснением совпадения от AI — без бесконечного свайпа.",
      },
      { property: "og:title", content: "Твои совпадения на сегодня — Я Онлайн" },
      {
        property: "og:description",
        content: "Пять осмысленных совпадений в день и подсказка для первого сообщения.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useDailyFeed();
  const reaction = useCandidateReaction();

  const [skipped, setSkipped] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [active, setActive] = useState<DailyMatch | null>(null);

  const matches = (data?.matches ?? []).filter((match) => !skipped.includes(match.id));
  const nextRefreshAt = data?.nextRefreshAt ?? new Date().toISOString();

  const handleSkip = (match: DailyMatch) => {
    setSkipped((prev) => [...prev, match.id]);
    reaction.mutate({ id: match.id, reaction: "skip" });
  };

  const handleSave = (match: DailyMatch) => {
    setSaved((prev) => (prev.includes(match.id) ? prev : [...prev, match.id]));
    reaction.mutate({ id: match.id, reaction: "save" });
  };

  const handleWrite = (match: DailyMatch) => {
    setActive(match);
    reaction.mutate({ id: match.id, reaction: "like" });
  };

  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {t("feed.dailyTitle", { count: data?.dailyLimit ?? 5 })}
          </h1>
          <RefreshCountdown nextRefreshAt={nextRefreshAt} />
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("feed.dailyDescription")}
        </p>
      </header>

      {isError ? <p className="text-sm text-destructive">{t("app.error")}</p> : null}

      {isPending ? (
        <div className="space-y-6">
          <ProfileCardSkeleton />
          <ProfileCardSkeleton />
        </div>
      ) : null}

      {!isPending && matches.length === 0 ? <FeedEmptyState nextRefreshAt={nextRefreshAt} /> : null}

      <ul className="space-y-8">
        {matches.map((match, index) => (
          <Reveal as="li" key={match.id} delay={index === 0 ? 0 : 80}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("feed.position", { current: index + 1, total: matches.length })}
            </p>
            <MatchCard
              match={match}
              saved={saved.includes(match.id)}
              onSkip={() => handleSkip(match)}
              onSave={() => handleSave(match)}
              onWrite={() => handleWrite(match)}
            />
          </Reveal>
        ))}
      </ul>

      {matches.length > 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("feed.endOfDay")}</p>
      ) : null}

      <FirstMessageSheet match={active} open={Boolean(active)} onClose={() => setActive(null)} />
    </AppShell>
  );
}
