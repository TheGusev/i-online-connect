import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Я Онлайн — знакомства и социальные связи" },
      {
        name: "description",
        content:
          "Я Онлайн — платформа знакомств и социальных связей: подбор людей, пространства по интересам и система доверия.",
      },
      { property: "og:title", content: "Я Онлайн — знакомства и социальные связи" },
      {
        property: "og:description",
        content: "Живые знакомства и настоящие связи: доверие вместо анкет.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();

  return (
    <AppShell>
      <section className="py-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t("home.title")}</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">{t("home.description")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/onboarding"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("home.start")}
          </Link>
          <Link
            to="/feed"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            {t("home.openFeed")}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
