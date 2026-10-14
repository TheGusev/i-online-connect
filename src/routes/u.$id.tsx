import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button, SpaceCardSkeleton } from "@/components/ds";
import { AppShell } from "@/components/layout/AppShell";
import { ListingAuthor } from "@/features/nearby/components/ListingAuthor";
import { ListingCard } from "@/features/nearby/components/ListingCard";
import { useUserListings } from "@/features/nearby/hooks";
import { useProfile } from "@/features/profile/hooks";

export const Route = createFileRoute("/u/$id")({
  head: () => ({
    meta: [
      { title: "Витрина пользователя — Я Онлайн" },
      { name: "description", content: "Активные и завершённые объявления пользователя в разделе «Рядом»." },
      { property: "og:title", content: "Витрина пользователя — Я Онлайн" },
      { property: "og:description", content: "Объявления пользователя в разделе «Рядом»." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserStorefront,
});

function UserStorefront() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<"active" | "finished">("active");
  const profile = useProfile(id);
  const listings = useUserListings(id);
  const items = (listings.data ?? []).filter((listing) =>
    tab === "active" ? listing.state === "active" : listing.state !== "active",
  );

  return (
    <AppShell wide>
      {profile.isPending ? <SpaceCardSkeleton /> : null}
      {profile.isError ? <p className="text-sm text-destructive">Витрина недоступна</p> : null}
      {profile.data ? (
        <header className="border-b border-border pb-5">
          <ListingAuthor
            author={{ name: profile.data.name, avatarUrl: profile.data.avatarUrl ?? null, trustLevel: profile.data.trustLevel }}
            full
          />
          {profile.data.city ? <p className="mt-2 text-sm text-muted-foreground">{profile.data.city}</p> : null}
        </header>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        <Button variant={tab === "active" ? "primary" : "ghost"} size="sm" onClick={() => setTab("active")}>Активные</Button>
        <Button variant={tab === "finished" ? "primary" : "ghost"} size="sm" onClick={() => setTab("finished")}>Завершённые</Button>
      </div>

      {listings.isPending ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2"><SpaceCardSkeleton /><SpaceCardSkeleton /></div>
      ) : null}
      {listings.isError ? <p className="mt-5 text-sm text-destructive">Не удалось загрузить объявления</p> : null}
      {!listings.isPending && !listings.isError && items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">В этой вкладке пока нет объявлений.</p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {items.map((listing) => <li key={listing.id}><ListingCard listing={listing} /></li>)}
        </ul>
      )}
    </AppShell>
  );
}