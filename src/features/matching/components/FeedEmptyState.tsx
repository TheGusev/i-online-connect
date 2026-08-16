import { Link } from "@tanstack/react-router";
import { Compass, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ds";
import { RefreshCountdown } from "./RefreshCountdown";

/** Дневной лимит закончился — предлагаем Spaces или доработку профиля. */
export function FeedEmptyState({ nextRefreshAt }: { nextRefreshAt: string }) {
  const { t } = useTranslation();

  return (
    <section className="rounded-3xl border border-border bg-gradient-warm p-8 text-center shadow-soft">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-card text-primary shadow-soft">
        <Sparkles className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-2xl font-bold text-foreground">{t("feed.empty.title")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t("feed.empty.description")}
      </p>
      <div className="mt-5 flex justify-center">
        <RefreshCountdown nextRefreshAt={nextRefreshAt} />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild variant="primary">
          <Link to="/spaces">
            <Compass className="size-4" aria-hidden="true" />
            {t("feed.empty.spaces")}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/profile/$id" params={{ id: "me" }}>
            {t("feed.empty.improve")}
          </Link>
        </Button>
      </div>
    </section>
  );
}
