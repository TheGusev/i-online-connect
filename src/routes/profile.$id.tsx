import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { useProfile } from "@/features/profile/hooks";
import { TrustBadge } from "@/features/trust/components/TrustBadge";

export const Route = createFileRoute("/profile/$id")({
  head: () => ({
    meta: [
      { title: "Профиль участника — Я Онлайн" },
      {
        name: "description",
        content: "Профиль участника «Я Онлайн»: интересы, город и уровень доверия.",
      },
      { property: "og:title", content: "Профиль участника — Я Онлайн" },
      {
        property: "og:description",
        content: "Что человек рассказал о себе и насколько подтверждён его профиль.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { data, isPending, isError } = useProfile(id);

  return (
    <AppShell>
      {isPending ? <p className="text-sm text-muted-foreground">{t("app.loading")}</p> : null}
      {isError ? <p className="text-sm text-destructive">{t("profile.notFound")}</p> : null}
      {data ? (
        <>
          <PageHeader
            title={`${data.name}, ${data.age}`}
            description={data.online ? t("profile.online") : t("profile.offline")}
          />
          <TrustBadge level={data.trustLevel} score={data.trustScore} />
          <section className="mt-6 space-y-4">
            <div>
              <h2 className="text-sm font-medium">{t("profile.city")}</h2>
              <p className="text-sm text-muted-foreground">{data.city}</p>
            </div>
            <div>
              <h2 className="text-sm font-medium">{t("profile.about")}</h2>
              <p className="text-sm text-muted-foreground">{data.bio}</p>
            </div>
            <div>
              <h2 className="text-sm font-medium">{t("profile.interests")}</h2>
              <ul className="mt-1 flex flex-wrap gap-2">
                {data.interests.map((interest) => (
                  <li
                    key={interest}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {interest}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <Link
            to="/chat"
            className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("profile.message")}
          </Link>
        </>
      ) : null}
    </AppShell>
  );
}
