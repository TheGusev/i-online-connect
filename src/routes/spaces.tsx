import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { useSpaces } from "@/features/spaces/hooks";

export const Route = createFileRoute("/spaces")({
  head: () => ({
    meta: [
      { title: "Пространства по интересам — Я Онлайн" },
      {
        name: "description",
        content: "Сообщества «Я Онлайн»: прогулки, книги, поддержка новичков в городе.",
      },
      { property: "og:title", content: "Пространства по интересам — Я Онлайн" },
      {
        property: "og:description",
        content: "Сообщества по интересам, где знакомства происходят сами.",
      },
    ],
  }),
  component: SpacesPage,
});

function SpacesPage() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useSpaces();

  return (
    <AppShell>
      <PageHeader title={t("spaces.title")} description={t("spaces.description")} />
      {isPending ? <p className="text-sm text-muted-foreground">{t("app.loading")}</p> : null}
      {isError ? <p className="text-sm text-destructive">{t("app.error")}</p> : null}
      <ul className="space-y-3">
        {data?.map((space) => (
          <li key={space.id} className="rounded-lg border border-border p-4">
            <h2 className="font-medium">{space.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{space.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("spaces.members", { count: space.membersCount })}
            </p>
            <button className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm">
              {t("spaces.join")}
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
