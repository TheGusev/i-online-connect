import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, Chip } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { badgeLevel } from "@/features/chat/trust";
import { IntentCard } from "@/features/profile/components/IntentCard";
import { ProfileActionBar } from "@/features/profile/components/ProfileActionBar";
import { ProfileHero } from "@/features/profile/components/ProfileHero";
import { ProfilePanel } from "@/features/profile/components/ProfilePanel";
import { TrustBadgeExplained } from "@/features/profile/components/TrustBadgeExplained";
import { useProfileDetail } from "@/features/profile/hooks";

export const Route = createFileRoute("/profile/$id")({
  head: () => ({
    meta: [
      { title: "Профиль участника — Я Онлайн" },
      {
        name: "description",
        content:
          "Личная страница участника «Я Онлайн»: о себе, намерение, интересы, ценности и подтверждённый бейдж доверия.",
      },
      { property: "og:title", content: "Профиль участника — Я Онлайн" },
      {
        property: "og:description",
        content: "Что человек рассказал о себе и чем подтверждён его профиль.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileViewPage,
});

function ProfileViewPage() {
  const { id } = Route.useParams();
  const { data, isPending, isError } = useProfileDetail(id);

  if (id === "me") {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Свой профиль открывается по адресу{" "}
          <Link to="/profile/me" className="font-semibold text-primary underline">
            /profile/me
          </Link>
          .
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {isPending ? <p className="text-sm text-muted-foreground">Загружаем профиль…</p> : null}
      {isError ? <p className="text-sm text-destructive">Профиль не найден</p> : null}

      {data ? (
        <div className="pb-10">
          <Reveal delay={60} className="mt-4">
            <ProfileHero
              media={data.media}
              name={data.name}
              age={data.age}
              city={data.city}
              trustLevel={badgeLevel(data.trustLevel)}
            />
            <ProfileActionBar id={data.id} name={data.name} />
          </Reveal>

          <ProfilePanel
            title="О себе"
            defaultOpen
            storageKey="about"
            className="mt-5"
          >
            <p className="max-w-2xl text-base leading-loose text-muted-foreground">{data.bio}</p>
          </ProfilePanel>

          <ProfilePanel title="Ищу" defaultOpen storageKey="intent">
            <IntentCard intent={data.intent} note={data.intentNote} />
          </ProfilePanel>

          <ProfilePanel
            title="Интересы"
            hint={`${data.interests.length}`}
            storageKey="interests"
          >
            <ul className="flex flex-wrap gap-2">
              {data.interests.map((interest) => (
                <li key={interest}>
                  <Chip>{interest}</Chip>
                </li>
              ))}
            </ul>
          </ProfilePanel>

          <ProfilePanel title="Что важно" hint={`${data.values.length}`} storageKey="values">
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.values.map((value) => (
                <li key={value}>
                  <Card className="h-full p-4 text-sm leading-relaxed">{value}</Card>
                </li>
              ))}
            </ul>
          </ProfilePanel>

          <ProfilePanel title="Доверие" storageKey="trust">
            <TrustBadgeExplained level={data.trustLevel} details={data.trust} />
          </ProfilePanel>
        </div>
      ) : null}
    </AppShell>
  );
}
