import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell, PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Знакомство с «Я Онлайн» — первые шаги" },
      {
        name: "description",
        content: "Несколько шагов настройки профиля, чтобы «Я Онлайн» подбирал людей, а не анкеты.",
      },
      { property: "og:title", content: "Знакомство с «Я Онлайн» — первые шаги" },
      {
        property: "og:description",
        content: "Аккаунт, рассказ о себе, интересы и подтверждение доверия.",
      },
    ],
  }),
  component: OnboardingPage,
});

const steps = ["account", "about", "interests", "trust"] as const;

function OnboardingPage() {
  const { t } = useTranslation();

  return (
    <AppShell>
      <PageHeader title={t("onboarding.title")} description={t("onboarding.description")} />
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{index + 1}</p>
            <p className="mt-1 font-medium">{t(`onboarding.steps.${step}`)}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex gap-3">
        <Link
          to="/feed"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("onboarding.next")}
        </Link>
        <Link
          to="/feed"
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm"
        >
          {t("onboarding.skip")}
        </Link>
      </div>
    </AppShell>
  );
}
