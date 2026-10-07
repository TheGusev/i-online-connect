import { Link } from "@tanstack/react-router";
import { CalendarDays, CalendarPlus, ChevronDown, Images, Info, Lock, LogOut, MoreHorizontal, Radio, Trash2, Unlock, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { mediaUrl } from "@/api";
import type { SpaceDetail, SpaceEvent } from "@/api/types";
import { Avatar, BottomSheet, Button, Chip, Modal } from "@/components/ds";
import { cn } from "@/lib/utils";
import { categoryLabels, formatLabels, formatSpaceAge } from "@/features/spaces/labels";

import type { LiveRoom } from "../live/useLiveRoom";

function Section({ icon, title, children, defaultOpen = false }: { icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-background">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold text-foreground">
        <span className="text-primary [&_svg]:size-4">{icon}</span>
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

export function SpaceMenu({
  space,
  events,
  room,
  demoLive,
  onToggleDemo,
  onEnterLive,
  onGallery,
  onInvite,
  onCreateEvent,
  onPrivacyChange,
  onDelete,
  onLeave,
  updatingPrivacy,
  deleting,
  leaving,
  renderEvents,
  openEvents = false,
}: {
  space: SpaceDetail;
  events: SpaceEvent[];
  room: LiveRoom;
  demoLive: boolean;
  onToggleDemo: () => void;
  onEnterLive: () => void;
  onGallery: () => void;
  onInvite: () => void;
  onCreateEvent: () => void;
  onPrivacyChange: (isPrivate: boolean) => void;
  onDelete: () => void;
  onLeave: () => void;
  updatingPrivacy: boolean;
  deleting: boolean;
  leaving: boolean;
  renderEvents: () => ReactNode;
  /** Открыть меню сразу на «Встречах» (ссылка из уведомления). */
  openEvents?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openEvents) setOpen(true); }, [openEvents]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <>
      <Button size="icon" variant="ghost" aria-label="Меню пространства" onClick={() => setOpen(true)} className="size-10 text-primary">
        <MoreHorizontal aria-hidden="true" />
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={space.title}>
        <div className="grid gap-2">
          {room.active ? (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-3">
              <span className="live-dot" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-primary-ink">Эфир идёт сейчас · {room.speakingCount} говорят</p>
              <Button size="sm" onClick={run(onEnterLive)}>Войти</Button>
            </div>
          ) : null}

          <Section icon={<Info />} title="О сообществе">
            <p className="leading-relaxed text-foreground">{space.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip variant="outline" size="sm">{space.isPrivate ? "Закрытое" : "Открытое"}</Chip>
              <Chip variant="outline" size="sm">{space.city}</Chip>
              <Chip variant="outline" size="sm">{categoryLabels[space.category]}</Chip>
              <Chip variant="outline" size="sm">{formatLabels[space.format]}</Chip>
              {space.interests.map((i) => <Chip key={i} variant="outline" size="sm">{i}</Chip>)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Организует {space.hostName} · {formatSpaceAge(space.createdAt)}</p>
          </Section>

          <Section icon={<UsersRound />} title={`Участники · ${space.membersCount}`}>
            <div className="grid gap-1">
              {space.members.map((m) => (
                <Link key={m.id} to="/profile/$id" params={{ id: m.id }} className="flex items-center gap-2 rounded-xl px-1 py-1.5 hover:bg-accent/10">
                  <Avatar name={m.name} src={mediaUrl(m.avatarUrl) ?? null} size="sm" />
                  <span className="text-foreground">{m.name}</span>
                </Link>
              ))}
            </div>
          </Section>

          <Section icon={<CalendarDays />} title={`Встречи · ${events.length}`} defaultOpen={openEvents}>
            {events.length > 0 ? renderEvents() : <p className="text-muted-foreground">Пока нет встреч.</p>}
          </Section>

          {space.isMember ? (
            <Button variant="secondary" fullWidth onClick={run(onGallery)}><Images aria-hidden="true" />Фото и видео</Button>
          ) : null}
          <Button variant="secondary" fullWidth onClick={onToggleDemo}>
            <Radio aria-hidden="true" />{demoLive ? "Выключить демо эфира" : "Включить демо эфира"}
          </Button>

          {space.isHost ? (
            <>
              <Button variant="secondary" fullWidth onClick={run(onInvite)}><UserPlus aria-hidden="true" />Пригласить человека</Button>
              <Button variant="secondary" fullWidth onClick={run(onCreateEvent)}><CalendarPlus aria-hidden="true" />Создать встречу</Button>
              <Button variant="secondary" fullWidth loading={updatingPrivacy} onClick={() => onPrivacyChange(!space.isPrivate)}>
                {space.isPrivate ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
                Сделать {space.isPrivate ? "открытым" : "закрытым"}
              </Button>
              <Button variant="danger" fullWidth onClick={run(() => setConfirmDelete(true))}><Trash2 aria-hidden="true" />Удалить пространство</Button>
            </>
          ) : space.isMember ? (
            <Button variant="ghost" fullWidth loading={leaving} onClick={run(onLeave)}><LogOut aria-hidden="true" />Покинуть пространство</Button>
          ) : null}
        </div>
      </BottomSheet>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Удалить пространство?"
        description="Участники, встречи и сообщения будут удалены без возможности восстановления."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button variant="danger" loading={deleting} onClick={onDelete}>Удалить</Button>
          </>
        }
      />
    </>
  );
}
