import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, CalendarDays, Crown, Lock, MapPin, MessagesSquare, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { mediaUrl } from "@/api";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, Button, Chip, MediaImage, ProfileCardSkeleton } from "@/components/ds";
import { ProfilePanel } from "@/features/profile/components/ProfilePanel";
import { CreateEventForm } from "@/features/spaces/components/CreateEventForm";
import { EventList } from "@/features/spaces/components/EventList";
import { JoinPanel } from "@/features/spaces/components/JoinPanel";
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
import { categoryLabels, formatLabels } from "@/features/spaces/labels";

export const Route = createFileRoute("/spaces/$id")({
  validateSearch: z.object({ eventId: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Сообщество — Я Онлайн" },
      { name: "description", content: "Сообщество «Я Онлайн»: участники, встречи и общий чат." },
      { property: "og:title", content: "Сообщество — Я Онлайн" },
      { property: "og:description", content: "Участники, встречи и общий чат сообщества «Я Онлайн»." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpaceDetailPage,
});

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

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
  const [eventOpen, setEventOpen] = useState(false);
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

  if (isPending) return <AppShell><ProfileCardSkeleton /></AppShell>;

  if (isError || !space) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">Сообщество не найдено.</p>
        <Link to="/spaces" className="mt-3 inline-block text-sm text-community-ink underline">Ко всем сообществам</Link>
      </AppShell>
    );
  }

  const sortedEvents = [...space.events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const chatError = sendMessage.error
    ? messageOf(sendMessage.error, "Сообщение не отправилось")
    : sendVoice.error
      ? messageOf(sendVoice.error, "Голосовое не отправилось")
      : null;

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-3xl">
        <header className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border pb-3">
          <Button asChild size="icon" variant="ghost" className="size-11 text-primary">
            <Link to="/spaces" aria-label="Назад к сообществам"><ArrowLeft className="size-6" aria-hidden="true" /></Link>
          </Button>

          <div className="relative shrink-0">
            <MediaImage
              src={space.coverUrl}
              alt={space.title}
              className="size-16 rounded-full border-2 border-primary/70 object-cover shadow-glow"
            />
            {space.verifiedCommunity ? (
              <span className="absolute bottom-0 right-0 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <BadgeCheck className="size-3.5" aria-label="Проверенное сообщество" />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 px-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-lg font-bold text-foreground">{space.title}</h1>
              {space.isPrivate ? <Lock className="size-3.5 shrink-0 text-primary" aria-label="Закрытое сообщество" /> : null}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-primary shadow-glow" />{space.membersCount}
              </span>
              <div className="flex -space-x-2" aria-label="Участники">
                {space.members.slice(0, 3).map((member) => (
                  <Avatar key={member.id} name={member.name} src={mediaUrl(member.avatarUrl) ?? null} size="xs" className="border-2 border-background" />
                ))}
              </div>
            </div>
          </div>

          {space.isHost ? (
            <SpaceOwnerMenu
              isPrivate={space.isPrivate}
              updatingPrivacy={updatePrivacy.isPending}
              deleting={deleteSpace.isPending}
              onInvite={() => setInviteOpen(true)}
              onCreateEvent={() => setEventOpen(true)}
              onPrivacyChange={(value) => updatePrivacy.mutate(value, {
                onSuccess: () => toast.success(value ? "Сообщество стало закрытым" : "Сообщество стало открытым"),
                onError: (error) => toast.error(messageOf(error, "Не удалось изменить приватность")),
              })}
              onDelete={() => deleteSpace.mutate(undefined, {
                onSuccess: () => window.location.assign("/spaces"),
                onError: (error) => toast.error(messageOf(error, "Не удалось удалить сообщество")),
              })}
            />
          ) : <span className="size-11" />}
        </header>

        <div className="mt-2 flex min-h-12 items-center gap-2 overflow-x-auto rounded-full border border-border bg-card px-3 py-2 text-sm [scrollbar-width:none]">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-semibold text-primary-ink">
            <ShieldCheck className="size-4" aria-hidden="true" />{space.isPrivate ? "Закрытое" : "Открытое"}
          </span>
          <span className="h-5 w-px shrink-0 bg-border" />
          <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground"><MapPin className="size-4 text-primary" aria-hidden="true" />{space.city}</span>
          <span className="h-5 w-px shrink-0 bg-border" />
          <span className="shrink-0 text-muted-foreground">{categoryLabels[space.category]}</span>
          <span className="h-5 w-px shrink-0 bg-border" />
          <span className="shrink-0 text-muted-foreground">{formatLabels[space.format]}</span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          {space.isHost ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary-ink">
              <Crown className="size-3.5" aria-hidden="true" />Вы организатор
            </span>
          ) : space.isMember ? (
            <Button size="sm" variant="ghost" loading={leave.isPending} onClick={() => leave.mutate()}>Выйти</Button>
          ) : (
            <JoinPanel space={space} pending={join.isPending || leave.isPending} onJoin={(answer) => join.mutate(answer)} onLeave={() => leave.mutate()} />
          )}
        </div>

        {space.invited && !space.isMember ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2.5">
            <p className="min-w-0 flex-1 text-sm">Вас приглашают присоединиться.</p>
            <Button size="sm" loading={join.isPending} onClick={() => join.mutate(undefined)}>Вступить</Button>
            <Button size="sm" variant="ghost" loading={declineInvite.isPending} onClick={() => declineInvite.mutate()}>Отклонить</Button>
          </div>
        ) : null}

        <ProfilePanel
          title="О сообществе"
          storageKey={`space-about:${space.id}`}
          hint={`${space.membersCount} участников`}
          className="mt-3 rounded-lg"
        >
          <p className="text-sm leading-relaxed text-foreground">{space.description}</p>
          {space.interests.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {space.interests.map((interest) => <Chip key={interest} variant="outline" size="sm">{interest}</Chip>)}
            </div>
          ) : null}
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <UsersRound className="size-4 text-primary" aria-hidden="true" />
            {space.membersCount} участников · организует {space.hostName}
          </p>
        </ProfilePanel>

        <section className="mt-4">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-xl font-bold text-foreground">
              <MessagesSquare className="size-5 text-community" aria-hidden="true" />Общий чат
            </h2>
            <span className="text-xs text-muted-foreground">{messages?.length ?? 0} сообщений</span>
          </div>
          <SpaceChat
            messages={messages ?? []}
            canWrite={space.isMember}
            sending={sendMessage.isPending}
            voiceSending={sendVoice.isPending}
            error={chatError}
            onSend={(text) => sendMessage.mutate(text)}
            onVoice={(recording) => sendVoice.mutate({ recording, clientTempId: crypto.randomUUID() })}
          />
        </section>

        {sortedEvents.length > 0 ? (
          <section className="mt-5">
            <h2 className="hud-title mb-2 inline-flex items-center gap-2"><CalendarDays className="size-4" aria-hidden="true" />Ближайшие встречи</h2>
            <EventList events={sortedEvents} pending={rsvp.isPending} isHost={space.isHost ?? false} highlightedId={eventId} onToggleGoing={(event) => rsvp.mutate({ eventId: event.id, going: !event.going })} />
          </section>
        ) : null}
      </div>

      {space.isHost ? (
        <CreateEventForm
          hideTrigger
          open={eventOpen}
          onOpenChange={setEventOpen}
          submitting={createEvent.isPending}
          onSubmit={(draft) => createEvent.mutate(draft, {
            onSuccess: () => toast.success("Встреча опубликована"),
            onError: (error) => toast.error(messageOf(error, "Не удалось создать встречу")),
          })}
        />
      ) : null}
      <SpaceInviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        query={inviteQuery}
        onQueryChange={setInviteQuery}
        candidates={candidates.data ?? []}
        loading={candidates.isFetching}
        invitingId={invite.isPending ? invite.variables : undefined}
        onInvite={(userId) => invite.mutate(userId, {
          onSuccess: () => toast.success("Приглашение отправлено"),
          onError: (error) => toast.error(messageOf(error, "Не удалось отправить приглашение")),
        })}
      />
    </AppShell>
  );
}
