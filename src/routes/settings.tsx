import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { USE_MOCK } from "@/api";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { useTrustSummary } from "@/features/trust/hooks";
import { supportedLanguages } from "@/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — Я Онлайн" },
      {
        name: "description",
        content: "Язык интерфейса, приватность, уведомления и уровень доверия профиля.",
      },
      { property: "og:title", content: "Настройки — Я Онлайн" },
      { property: "og:description", content: "Управление профилем и уровнем доверия." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: trust } = useTrustSummary();

  return (
    <AppShell>
      <PageHeader title={t("settings.title")} />
      <section className="space-y-6">
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">{t("settings.language")}</h2>
          <div className="mt-2 flex gap-2">
            {supportedLanguages.map((language) => (
              <button
                key={language}
                onClick={() => void i18n.changeLanguage(language)}
                className={`rounded-md border border-border px-3 py-1.5 text-sm ${
                  i18n.language === language ? "bg-accent" : ""
                }`}
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">{t("settings.trust")}</h2>
          {trust ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("trust.score")}: {trust.score} — {t(`trust.levels.${trust.level}`)}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {trust.checks.map((check) => (
                  <li key={check.id} className="flex justify-between gap-3">
                    <span>{check.label}</span>
                    <span className="text-muted-foreground">
                      {check.done ? t("trust.done") : t("trust.pending")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("app.loading")}</p>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">{t("settings.apiMode")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {USE_MOCK ? t("settings.apiModeMock") : t("settings.apiModeLive")}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">{t("settings.notifications")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.empty")}</p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">{t("settings.privacy")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.empty")}</p>
        </div>
      </section>
    </AppShell>
  );
}
