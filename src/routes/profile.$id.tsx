import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

import { Card, Chip } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { IntentCard } from "@/features/profile/components/IntentCard";
import { MediaCarousel } from "@/features/profile/components/MediaCarousel";
import { ProfileActionBar } from "@/features/profile/components/ProfileActionBar";
import { ProfileCollapseToggle } from "@/features/profile/components/ProfileCollapseToggle";
import { ProfileSection } from "@/features/profile/components/ProfileSection";
import { TrustBadgeExplained } from "@/features/profile/components/TrustBadgeExplained";
import { useProfileDetail } from "@/features/profile/hooks";
import { useProfileCollapse } from "@/features/profile/hooks/useProfileCollapse";

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
  const { collapsed, toggle } = useProfileCollapse();

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
        <div className="pb-24">
          <Reveal delay={80} as="header" className="mt-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <Avatar
                name={data.name}
                src={
                  (
                    data.media.find((item) => item.kind === "photo" && item.isPrimary) ??
                    data.media.find((item) => item.kind === "photo")
                  )?.url ?? null
                }
                size="lg"
              />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                  {data.name}, {data.age}
                </h1>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{data.city}</span>
                </p>
              </div>
            </div>
            <div className="mt-4">
              <TrustBadgeExplained level={data.trustLevel} details={data.trust} />
            </div>
          </Reveal>

          <div className="mt-6 flex items-center justify-between gap-4 border-t pt-4">
            <ProfileCollapseToggle collapsed={collapsed} onToggle={toggle} />
          </div>

          {!collapsed && (
            <div id="profile-collapsible-content">
              <Reveal delay={40}>
                <MediaCarousel media={data.media} name={data.name} />
              </Reveal>

              <Reveal delay={80} className="mt-4">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4" aria-hidden="true" />
                  {data.city}
                </p>
              </Reveal>

              <ProfileSection title="О себе" delay={60}>
                <p className="max-w-2xl text-base leading-loose text-muted-foreground">
                  {data.bio}
                </p>
              </ProfileSection>

              <ProfileSection title="Ищу" delay={60}>
                <IntentCard intent={data.intent} note={data.intentNote} />
              </ProfileSection>

              <ProfileSection title="Интересы" delay={60}>
                <ul className="flex flex-wrap gap-2">
                  {data.interests.map((interest) => (
                    <li key={interest}>
                      <Chip>{interest}</Chip>
                    </li>
                  ))}
                </ul>
              </ProfileSection>

              <ProfileSection title="Что важно" delay={60}>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.values.map((value) => (
                    <li key={value}>
                      <Card className="h-full p-5 text-base leading-relaxed">{value}</Card>
                    </li>
                  ))}
                </ul>
              </ProfileSection>
            </div>
          )}

          <ProfileActionBar id={data.id} name={data.name} />
        </div>
      ) : null}
    </AppShell>
  );
}
