import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, CalendarDays, MapPin, MessagesSquare } from "lucide-react";

import { WaveHeading } from "@/components/landing/WaveHeading";
import { AppShell } from "@/components/layout/AppShell";
import { Chip, MediaImage, ProfileCardSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { ProfilePanel } from "@/features/profile/components/ProfilePanel";
import { CreateEventForm } from "@/features/spaces/components/CreateEventForm";
import { EventList } from "@/features/spaces/components/EventList";
import { JoinPanel } from "@/features/spaces/components/JoinPanel";
import { MembershipBadge } from "@/features/spaces/components/MembershipBadge";
import { ParticipantsCarousel } from "@/features/spaces/components/ParticipantsCarousel";
import { SpaceChat } from "@/features/spaces/components/SpaceChat";
import {
  useCreateSpaceEvent,
  useJoinSpace,
  useLeaveSpace,
  useRsvpEvent,
  useSendSpaceMessage,
  useSpace,
  useSpaceMessages,
} from "@/features/spaces/hooks";
import { cadenceLabels, categoryLabels, formatLabels } from "@/features/spaces/labels";
import { mediaUrl } from "@/api";

export const Route = createFileRoute("/spaces/$id")({
  head: () => ({
    meta: [
      { title: "Пространство — Я Онлайн" },
      {
        name: "description",
        content: "Описание сообщества, участники, ближайшие события с кнопкой «Пойду» и общий чат.",
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
  const createEvent = useCreateSpaceEvent(id);

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
        className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Пространства
      </Link>

      {/* Обложка: название и все метаданные одной строкой — без отдельного блока-заголовка. */}
      <Reveal className="relative overflow-hidden rounded-3xl border border-border shadow-soft">
        <div className="relative aspect-[16/9] sm:aspect-[16/6]">
          <MediaImage src={space.coverUrl} alt={space.title} className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

          {space.verifiedCommunity ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-community px-2.5 py-1 text-[11px] font-semibold text-community-foreground shadow-soft">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Проверенное
            </span>
          ) : null}

          <div className="absolute inset-x-3 bottom-3">
            <WaveHeading as="h1" className="text-xl font-bold tracking-tight sm:text-3xl">
              {space.title}
            </WaveHeading>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {space.city} · {space.distanceKm} км
              </span>
              <span aria-hidden="true">·</span>
              <span>{categoryLabels[space.category]}</span>
              <span aria-hidden="true">·</span>
              <span>{formatLabels[space.format]}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {cadenceLabels[space.cadence]}
              </span>
            </p>
          </div>
        </div>
      </Reveal>

      {/* Статус участия и вход — компактной строкой сразу под обложкой. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {space.isMember ? (
          <MembershipBadge
            host={space.isHost ?? false}
            pending={leave.isPending}
            onLeave={() => leave.mutate()}
          />
        ) : (
          <JoinPanel
            space={space}
            pending={join.isPending || leave.isPending}
            onJoin={(answer) => join.mutate(answer)}
            onLeave={() => leave.mutate()}
          />
        )}
        {space.isHost ? (
          <CreateEventForm
            submitting={createEvent.isPending}
            onSubmit={(draft) => createEvent.mutate(draft)}
          />
        ) : null}
      </div>

      {/* Участники: ряд аватаров со свайпом и переходом в анкету. */}
      <section className="mt-4">
        <h2 className="hud-title mb-2">Участники</h2>
        <ParticipantsCarousel
          members={space.members}
          total={space.membersCount}
          hostName={space.hostName}
        />
      </section>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-4">
          <section>
            <h2 className="hud-title mb-2">Ближайшие встречи</h2>
            <EventList
              events={sortedEvents}
              pending={rsvp.isPending}
              isHost={space.isHost ?? false}
              onToggleGoing={(event) => rsvp.mutate({ eventId: event.id, going: !event.going })}
            />
          </section>

          <ProfilePanel
            title="О сообществе"
            storageKey={`space-about:${space.id}`}
            defaultOpen={false}
            hint={space.interests.length > 0 ? `Интересы: ${space.interests.length}` : undefined}
          >
            <p className="text-sm leading-relaxed text-foreground">{space.description}</p>
            {space.interests.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {space.interests.map((interest) => (
                  <Chip key={interest} variant="outline" size="sm">
                    {interest}
                  </Chip>
                ))}
              </div>
            ) : null}
          </ProfilePanel>
        </div>

        <Reveal as="section" delay={80} className="min-w-0">
          <h2 className="hud-title mb-2 inline-flex items-center gap-2">
            <MessagesSquare className="size-4 text-community" aria-hidden="true" />
            Общий чат
          </h2>
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
