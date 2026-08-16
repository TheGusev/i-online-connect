import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { useCandidates } from "@/features/matching/hooks";
import { TrustBadge } from "@/features/trust/components/TrustBadge";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Лента знакомств — Я Онлайн" },
      {
        name: "description",
        content: "Подборка людей с совпадением по интересам, городу и уровню доверия.",
      },
      { property: "og:title", content: "Лента знакомств — Я Онлайн" },
      {
        property: "og:description",
        content: "Люди, которые могут вам подойти, с объяснением совпадения.",
      },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useCandidates();

  return (
    <AppShell>
      <PageHeader title={t("feed.title")} description={t("feed.description")} />
      {isPending ? <p className="text-sm text-muted-foreground">{t("app.loading")}</p> : null}
      {isError ? <p className="text-sm text-destructive">{t("app.error")}</p> : null}
      <ul className="space-y-3">
        {data?.map((candidate) => (
          <li key={candidate.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  to="/profile/$id"
                  params={{ id: candidate.id }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {candidate.name}, {candidate.age}
                </Link>
                <p className="text-sm text-muted-foreground">{candidate.city}</p>
              </div>
              <TrustBadge level={candidate.trustLevel} score={candidate.trustScore} />
            </div>
            <p className="mt-2 text-sm">{candidate.bio}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("feed.compatibility")}: {candidate.compatibility}% — {candidate.reasons.join(", ")}
            </p>
            <div className="mt-3 flex gap-2">
              <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
                {t("feed.like")}
              </button>
              <button className="rounded-md border border-border px-3 py-1.5 text-sm">
                {t("feed.skip")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
