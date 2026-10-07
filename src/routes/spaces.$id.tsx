import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, Crown, Lock, Radio } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useIsMobile } from "@/hooks/use-mobile";
import { AppShell } from "@/components/layout/AppShell";
import { Button, MediaImage, ProfileCardSkeleton } from "@/components/ds";
import { CreateEventForm } from "@/features/spaces/components/CreateEventForm";
import { EventList } from "@/features/spaces/components/EventList";
import { JoinPanel } from "@/features/spaces/components/JoinPanel";
import { MediaGallery, MediaGalleryButton } from "@/features/chat/components/MediaGallery";
import { SpaceChat } from "@/features/spaces/components/SpaceChat";
import { SpaceInviteDialog } from "@/features/spaces/components/SpaceInviteDialog";
import { InviteQrSheet } from "@/components/InviteQrSheet";
import { SpaceMenu } from "@/features/spaces/components/SpaceMenu";
import { LiveBanner } from "@/features/spaces/live/LiveBanner";
import { LiveRoomScreen } from "@/features/spaces/live/LiveRoomScreen";
import { useLiveRoom, type LiveRoom, type LiveSeedMember } from "@/features/spaces/live/useLiveRoom";
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
  useSendSpaceMediaMessage,
  useSendSpaceVoiceMessage,
  useSpace,
  useSpaceMessages,
  useUpdateSpacePrivacy,
} from "@/features/spaces/hooks";
import { useVerificationStatus } from "@/features/trust/hooks";

export const Route = createFileRoute("/spaces/$id")({
  validateSearch: z.object({ eventId: z.string().uuid().optional(), demo: z.string().optional() }),
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
  const { eventId, demo } = Route.useSearch();
  const { data: space, isPending, isError } = useSpace(id);
  const { data: messages } = useSpaceMessages(id, Boolean(space?.isMember));
  const join = useJoinSpace(id);
  const leave = useLeaveSpace(id);
  const rsvp = useRsvpEvent(id);
  const sendMessage = useSendSpaceMessage(id);
  const sendVoice = useSendSpaceVoiceMessage(id);
  const sendMedia = useSendSpaceMediaMessage(id);
  // Фото и видео в общий чат — только подтверждённым участникам.
  const verification = useVerificationStatus();
  const canSendMedia = verification.data?.status === "verified";
  const createEvent = useCreateSpaceEvent(id);
  const updatePrivacy = useUpdateSpacePrivacy(id);
  const deleteSpace = useDeleteSpace(id);
  const declineInvite = useDeclineSpaceInvite(id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const isMobile = useIsMobile();
  const [eventOpen, setEventOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const candidates = useInviteCandidates(id, inviteQuery, inviteOpen);
  const invite = useInviteToSpace(id);

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
      : sendMedia.error
        ? messageOf(sendMedia.error, "Вложение не отправилось")
        : null;

  const liveMembers = space.members.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null }));
  const renderEvents = () => (
    <EventList events={sortedEvents} pending={rsvp.isPending} isHost={space.isHost ?? false} highlightedId={eventId} onToggleGoing={(event) => rsvp.mutate({ eventId: event.id, going: !event.going })} />
  );

  return (
    <AppShell wide focused>
      <SpaceLive spaceId={id} demoInitial={demo === "live"} members={liveMembers}>
        {(room, demoLive, toggleDemo, setLiveOpen) => (
      <div
        className={isMobile
          ? "keyboard-viewport-fixed z-10 flex flex-col bg-background px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
          : "mx-auto flex h-[calc(var(--vvh,100dvh)-1.5rem)] w-full max-w-3xl flex-col"}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border pb-2">
          <Button asChild size="icon" variant="ghost" className="size-10 text-primary">
            <Link to="/spaces" aria-label="Назад к сообществам"><ArrowLeft className="size-6" aria-hidden="true" /></Link>
          </Button>
          <div className="relative shrink-0">
            <MediaImage src={space.coverUrl} alt={space.title} className="size-11 rounded-full border-2 border-primary/70 object-cover" />
            {space.verifiedCommunity ? (
              <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                <BadgeCheck className="size-3" aria-label="Проверенное сообщество" />
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h1 className="truncate text-base font-bold text-foreground">{space.title}</h1>
              {space.isHost ? <Crown className="size-3.5 shrink-0 text-primary" aria-label="Вы организатор" /> : null}
              {space.isPrivate ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Закрытое" /> : null}
            </div>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              {room.online !== null ? `${room.online} в сети` : room.active ? `${room.participants.length} в сети` : `${space.membersCount} участников`} · {space.city}
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Эфир" onClick={() => setLiveOpen(true)} className="relative size-10 text-primary">
            <Radio aria-hidden="true" />
            {room.active ? <span className="live-dot absolute right-2 top-2" /> : null}
          </Button>
          {space.isMember ? <MediaGalleryButton onClick={() => setGalleryOpen(true)} className="size-10" /> : null}
          <SpaceMenu
            space={space}
            events={sortedEvents}
            room={room}
            demoLive={demoLive}
            onToggleDemo={toggleDemo}
            onEnterLive={() => setLiveOpen(true)}
            onGallery={() => setGalleryOpen(true)}
            onInvite={() => setInviteOpen(true)}
            onShare={() => setQrOpen(true)}
            onCreateEvent={() => setEventOpen(true)}
            onPrivacyChange={(value) => updatePrivacy.mutate(value, {
              onSuccess: () => toast.success(value ? "Сообщество стало закрытым" : "Сообщество стало открытым"),
              onError: (error) => toast.error(messageOf(error, "Не удалось изменить приватность")),
            })}
            onDelete={() => deleteSpace.mutate(undefined, {
              onSuccess: () => window.location.assign("/spaces"),
              onError: (error) => toast.error(messageOf(error, "Не удалось удалить сообщество")),
            })}
            onLeave={() => leave.mutate(undefined, { onError: (error) => toast.error(messageOf(error, "Не удалось выйти")) })}
            updatingPrivacy={updatePrivacy.isPending}
            deleting={deleteSpace.isPending}
            leaving={leave.isPending}
            renderEvents={renderEvents}
            openEvents={Boolean(eventId)}
          />
        </header>
        <MediaGallery scope="space" id={id} open={galleryOpen} onClose={() => setGalleryOpen(false)} />

        <LiveBanner room={room} onEnter={() => setLiveOpen(true)} />

        {!space.isMember && !space.isHost && !space.invited ? (
          <div className="mt-2 shrink-0">
            <JoinPanel space={space} pending={join.isPending || leave.isPending} onJoin={(answer) => join.mutate(answer, { onError: (error) => toast.error(messageOf(error, "Не удалось вступить")) })} onLeave={() => leave.mutate()} />
          </div>
        ) : null}

        {space.invited && !space.isMember ? (
          <div className="mt-2 flex shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2.5">
            <p className="min-w-0 flex-1 text-sm">Вас приглашают присоединиться.</p>
            <Button size="sm" loading={join.isPending} onClick={() => join.mutate(undefined, { onError: (error) => toast.error(messageOf(error, "Не удалось вступить")) })}>Вступить</Button>
            <Button size="sm" variant="ghost" loading={declineInvite.isPending} onClick={() => declineInvite.mutate(undefined, { onError: (error) => toast.error(messageOf(error, "Не удалось отклонить приглашение")) })}>Отклонить</Button>
          </div>
        ) : null}

        <section className="mt-1 flex min-h-0 flex-1 flex-col">
          <SpaceChat
            fill
            messages={messages ?? []}
            canWrite={space.isMember}
            sending={sendMessage.isPending}
            voiceSending={sendVoice.isPending}
            mediaSending={sendMedia.isPending}
            {...(canSendMedia
              ? {
                  onMedia: (media) =>
                    sendMedia.mutate({ media, clientTempId: crypto.randomUUID() }),
                }
              : {})}
            error={chatError}
            onSend={(text) => sendMessage.mutateAsync(text).then(() => undefined)}
            onVoice={(recording) => sendVoice.mutate({ recording, clientTempId: crypto.randomUUID() })}
          />
        </section>
      </div>
        )}
      </SpaceLive>
      {space.isHost ? (
        <CreateEventForm
          hideTrigger
          open={eventOpen}
          onOpenChange={setEventOpen}
          submitting={createEvent.isPending}
          onSubmit={(draft) => createEvent.mutateAsync(draft).then(() => {
            toast.success("Встреча опубликована");
          }).catch((error: unknown) => {
            toast.error(messageOf(error, "Не удалось создать встречу"));
            throw error;
          })}
        />
      ) : null}
      <InviteQrSheet open={qrOpen} onClose={() => setQrOpen(false)} url={typeof window === "undefined" ? "" : `${window.location.origin}/spaces/${id}`} />
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

function SpaceLive({
  spaceId,
  demoInitial,
  members,
  children,
}: {
  spaceId: string;
  demoInitial: boolean;
  members: LiveSeedMember[];
  children: (room: LiveRoom, demo: boolean, toggleDemo: () => void, setOpen: (open: boolean) => void) => ReactNode;
}) {
  const [demo, setDemo] = useState(demoInitial);
  const [open, setOpen] = useState(false);
  const room = useLiveRoom(spaceId, { demo, members });
  return (
    <>
      {children(room, demo, () => setDemo((d) => !d), setOpen)}
      <LiveRoomScreen open={open} title="Эфир" spaceId={spaceId} demo={demo} room={room} onClose={() => setOpen(false)} />
    </>
  );
}
