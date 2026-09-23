import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, CalendarDays, Lock, MapPin, MessagesSquare, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/layout/AppShell";
import { Button, Chip, MediaImage, ProfileCardSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { ProfilePanel } from "@/features/profile/components/ProfilePanel";
import { CreateEventForm } from "@/features/spaces/components/CreateEventForm";
import { EventList } from "@/features/spaces/components/EventList";
import { JoinPanel } from "@/features/spaces/components/JoinPanel";
import { MembershipBadge } from "@/features/spaces/components/MembershipBadge";
import { ParticipantsCarousel } from "@/features/spaces/components/ParticipantsCarousel";
import { SpaceChat } from "@/features/spaces/components/SpaceChat";
import { SpaceInviteDialog } from "@/features/spaces/components/SpaceInviteDialog";
import { SpaceOwnerMenu } from "@/features/spaces/components/SpaceOwnerMenu";
import {
  useCreateSpaceEvent,
  useDeclineSpaceInvite,
  useDeleteSpace,
  useInviteCandidates,
  useInviteToSpace,
  useJoinSpace,
  useLeaveSpace,
  useRsvpEvent,
  useSendSpaceMessage,
  useSendSpaceVoiceMessage,
  useSpace,
  useSpaceMessages,
  useUpdateSpacePrivacy,
} from "@/features/spaces/hooks";
import { cadenceLabels, categoryLabels, formatLabels } from "@/features/spaces/labels";
import { mediaUrl } from "@/api";

export const Route = createFileRoute("/spaces/$id")({
  validateSearch: z.object({ eventId: z.string().uuid().optional() }),
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
  const { eventId } = Route.useSearch();
  const { data: space, isPending, isError } = useSpace(id);
  const { data: messages } = useSpaceMessages(id, Boolean(space?.isMember));
  const join = useJoinSpace(id);
  const leave = useLeaveSpace(id);
  const rsvp = useRsvpEvent(id);
  const sendMessage = useSendSpaceMessage(id);
  const sendVoice = useSendSpaceVoiceMessage(id);
  const createEvent = useCreateSpaceEvent(id);
  const updatePrivacy = useUpdateSpacePrivacy(id);
  const deleteSpace = useDeleteSpace(id);
  const declineInvite = useDeclineSpaceInvite(id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const candidates = useInviteCandidates(id, inviteQuery, inviteOpen);
  const invite = useInviteToSpace(id);

  useEffect(() => {
    if (!eventId || !space) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`event-${eventId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [eventId, space]);

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
        className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-primary transition-opacity hover:opacity-80"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Пространства
      </Link>

      <Reveal className="flex flex-col items-center px-3 pb-1 text-center">
        <div className="relative">
          <MediaImage
            src={space.coverUrl}
            alt={space.title}
            className="size-28 rounded-full border-2 border-primary/70 object-cover shadow-glow sm:size-32"
          />
          {space.verifiedCommunity ? (
            <span className="absolute bottom-1 right-1 grid size-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground">
              <BadgeCheck className="size-4" aria-label="Проверенное пространство" />
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{space.title}</h1>
          {space.isPrivate ? <Lock className="size-4 text-primary" aria-label="Закрытое пространство" /> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{space.membersCount} участников</p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{space.city} · {space.distanceKm} км</span>
          <span aria-hidden="true">·</span>
          <span>{categoryLabels[space.category]}</span>
          <span aria-hidden="true">·</span>
          <span>{formatLabels[space.format]}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden="true" />{cadenceLabels[space.cadence]}</span>
        </p>
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
        <div className="flex items-center gap-2">
        {space.isHost ? (
          <SpaceOwnerMenu
            isPrivate={space.isPrivate}
            updatingPrivacy={updatePrivacy.isPending}
            deleting={deleteSpace.isPending}
            onInvite={() => setInviteOpen(true)}
            onPrivacyChange={(value) => updatePrivacy.mutate(value)}
            onDelete={() => deleteSpace.mutate(undefined, { onSuccess: () => window.location.assign("/spaces") })}
          />
        ) : null}
        {space.isHost ? (
          <CreateEventForm
            submitting={createEvent.isPending}
            onSubmit={(draft) => createEvent.mutate(draft)}
          />
        ) : null}
        </div>
      </div>

      {space.invited && !space.isMember ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-3 shadow-glow">
          <UserPlus className="size-4 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-foreground">Организатор приглашает вас присоединиться.</p>
          <Button size="sm" loading={join.isPending} onClick={() => join.mutate(undefined)}>Вступить</Button>
          <Button size="sm" variant="ghost" loading={declineInvite.isPending} onClick={() => declineInvite.mutate()}>Отклонить</Button>
        </div>
      ) : null}

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
              highlightedId={eventId}
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
            {space.isPrivate ? <Lock className="size-3.5 text-primary" aria-label="Закрытое пространство" /> : null}
          </h2>
          <SpaceChat
            messages={messages ?? []}
            canWrite={space.isMember}
            sending={sendMessage.isPending}
            voiceSending={sendVoice.isPending}
            onSend={(text) => sendMessage.mutate(text)}
            onVoice={(recording) => sendVoice.mutate({ recording, clientTempId: crypto.randomUUID() })}
          />
        </Reveal>
      </div>
      <SpaceInviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        query={inviteQuery}
        onQueryChange={setInviteQuery}
        candidates={candidates.data ?? []}
        loading={candidates.isFetching}
        invitingId={invite.isPending ? invite.variables : undefined}
        onInvite={(userId) => invite.mutate(userId)}
      />
    </AppShell>
  );
}
