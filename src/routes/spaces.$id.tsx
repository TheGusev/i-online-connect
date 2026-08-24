import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, CalendarDays, MapPin, MessagesSquare } from "lucide-react";

import { WaveHeading } from "@/components/landing/WaveHeading";
import { AppShell } from "@/components/layout/AppShell";
import { Chip, ProfileCardSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { EventList } from "@/features/spaces/components/EventList";
import { JoinPanel } from "@/features/spaces/components/JoinPanel";
import { MemberStrip } from "@/features/spaces/components/MemberStrip";
import { SpaceChat } from "@/features/spaces/components/SpaceChat";
import {
  useJoinSpace,
  useLeaveSpace,
  useRsvpEvent,
  useSendSpaceMessage,
  useSpace,
  useSpaceMessages,
} from "@/features/spaces/hooks";
import { cadenceLabels, categoryLabels, formatLabels } from "@/features/spaces/labels";

export const Route = createFileRoute("/spaces/$id")({
  head: () => ({
    meta: [
      { title: "Пространство — Я Онлайн" },
      {
        name: "description",
        content:
          "Описание сообщества, участники, ближайшие события с кнопкой «Пойду» и общий чат.",
      },
      { property: "og:title", content: "Пространство — Я Онлайн" },
      {
        property: "og:description",
        content: "Сообщество «Я Онлайн»: события, участники и общий чат.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpaceDetailPage,
});

function SpaceDetailPage() {
  const { id } = Route.useParams();
  const { data: space, isPending, isError } = useSpace(id);
  const { data: messages } = useSpaceMessages(id);
  const join = useJoinSpace(id);
  const leave = useLeaveSpace(id);
  const rsvp = useRsvpEvent(id);
  const sendMessage = useSendSpaceMessage(id);

  if (isPending) {
    return (
      <AppShell>
        <ProfileCardSkeleton />
      </AppShell>
    );
  }

  if (isError || !space) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">Пространство не найдено.</p>
        <Link to="/spaces" className="mt-3 inline-block text-sm text-community-ink underline">
          Ко всем пространствам
        </Link>
      </AppShell>
    );
  }

  const sortedEvents = [...space.events].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  return (
    <AppShell wide>
      <Link
        to="/spaces"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Пространства
      </Link>

      <Reveal className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
        <div className="relative aspect-[16/6]">
          <img
            src={space.coverUrl}
            alt={space.title}
            width={1024}
            height={640}
            className="size-full object-cover"
          />
          {space.verifiedCommunity ? (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-community px-3 py-1 text-xs font-semibold text-community-foreground shadow-soft">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Проверенное сообщество
            </span>
          ) : null}
        </div>

        <div className="space-y-5 p-6">
          <div>
            <WaveHeading as="h1" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {space.title}
            </WaveHeading>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" />
                {space.city} · {space.distanceKm} км
              </span>
              <span>{categoryLabels[space.category]}</span>
              <span>{formatLabels[space.format]}</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {cadenceLabels[space.cadence]}
              </span>
            </div>
          </div>

          <p className="max-w-3xl text-sm leading-relaxed text-foreground">{space.description}</p>

          {space.interests.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {space.interests.map((interest) => (
                <Chip key={interest} variant="outline" size="sm">
                  {interest}
                </Chip>
              ))}
            </div>
          ) : null}

          <MemberStrip
            members={space.members}
            total={space.membersCount}
            hostName={space.hostName}
          />

          <JoinPanel
            space={space}
            pending={join.isPending || leave.isPending}
            onJoin={(answer) => join.mutate(answer)}
            onLeave={() => leave.mutate()}
          />
        </div>
      </Reveal>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <Reveal as="section">
          <h2 className="mb-3 text-lg font-bold">Ближайшие события</h2>
          <EventList
            events={sortedEvents}
            pending={rsvp.isPending}
            onToggleGoing={(event) => rsvp.mutate({ eventId: event.id, going: !event.going })}
          />
        </Reveal>

        <Reveal as="section" delay={80}>
          <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold">
            <MessagesSquare className="size-4 text-community" aria-hidden="true" />
            Общий чат сообщества
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Отдельно от личных диалогов: здесь обсуждают встречи, а не знакомятся один на один.
          </p>
          <SpaceChat
            messages={messages ?? []}
            canWrite={space.isMember}
            sending={sendMessage.isPending}
            onSend={(text) => sendMessage.mutate(text)}
          />
        </Reveal>
      </div>
    </AppShell>
  );
}
