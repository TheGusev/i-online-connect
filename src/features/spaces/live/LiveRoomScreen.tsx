import { Link } from "@tanstack/react-router";
import { LogOut, Mic, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createPortal } from "react-dom";

import { mediaUrl, spacesApi } from "@/api";
import { useVoiceRecorder } from "@/features/chat/useVoiceRecorder";
import { getRate, pauseOthers, registerVoice } from "@/features/chat/voicePlayback";
import { useSessionStore } from "@/store/useSessionStore";
import { Avatar, Button } from "@/components/ds";
import { cn } from "@/lib/utils";

import { ClipBricks } from "./ClipBricks";
import type { LiveClip, LiveParticipant, LiveRoom } from "./useLiveRoom";

const MAX_BALLS = 12;
const POCKETS = [
  [4, 6], [50, 2], [96, 6], [4, 94], [50, 98], [96, 94],
] as const;

function seatOf(i: number, total: number, speaking: boolean): [number, number] {
  const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = speaking ? 0.62 : 0.78;
  return [50 + Math.cos(angle) * 38 * r, 50 + Math.sin(angle) * 36 * r];
}

export function LiveRoomScreen({
  open,
  title,
  spaceId,
  demo = false,
  room,
  onClose,
  onInvite,
}: {
  open: boolean;
  title: string;
  spaceId?: string;
  demo?: boolean;
  room: LiveRoom;
  onClose: () => void;
  onInvite?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<LiveParticipant | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const myId = useSessionStore((st) => st.user?.id ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heardRef = useRef(new Set<string>());
  const real = Boolean(room.real && spaceId && !demo);
  const actions = room.actions;

  const recorder = useVoiceRecorder((rec) => {
    if (!spaceId || !actions) return;
    const clientTempId = crypto.randomUUID();
    if (myId) actions.addDraft({ id: `draft-${clientTempId}`, userId: myId, durationMs: rec.durationMs, createdAt: Date.now(), clientTempId });
    spacesApi.sendSpaceVoiceMessage(spaceId, rec.blob, rec.durationMs, clientTempId, true).catch((error: unknown) => {
      actions.dropDraft(clientTempId);
      toast.error(error instanceof Error ? error.message : "Клип не отправился");
    });
  });

  // Один общий <audio> для эфира, зарегистрированный в общем плеере голосовых.
  useEffect(() => {
    if (!open) return;
    const audio = new Audio();
    audioRef.current = audio;
    const unregister = registerVoice("live-room", audio, () => void audio.play().catch(() => undefined));
    return () => { audio.pause(); unregister(); audioRef.current = null; setUnlocked(false); };
  }, [open]);

  // Вход/выход из эфира на сервере.
  useEffect(() => {
    if (!open || !real || !room.active) return;
    actions?.join();
    return () => actions?.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, real, room.active]);

  // Новые клипы других участников играют сами, если звук разблокирован.
  useEffect(() => {
    if (!open || !real) return;
    const last = room.clips[room.clips.length - 1];
    if (!last || last.draft || heardRef.current.has(last.id)) return;
    heardRef.current.add(last.id);
    if (last.userId === myId || !unlocked || muted || recorder.recording) return;
    playClip(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.clips, open, real]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 2000);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearInterval(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const balls = room.participants.slice(0, MAX_BALLS);
  const extra = room.participants.length - balls.length;
  const pos = new Map(balls.map((p, i) => [p.userId, seatOf(i, balls.length, p.isSpeaking)]));

  function playClip(clip: LiveClip) {
    setActiveClip(clip.id);
    const audio = audioRef.current;
    const src = mediaUrl(clip.audioUrl) ?? clip.audioUrl;
    if (src && !muted && audio) {
      pauseOthers("live-room");
      audio.src = src;
      audio.playbackRate = getRate();
      void audio.play().catch(() => undefined);
    }
    window.setTimeout(() => setActiveClip((c) => (c === clip.id ? null : c)), clip.durationMs / getRate());
  }
  const unlock = () => {
    const audio = audioRef.current;
    if (audio) {
      // Тихий звук по касанию разблокирует воспроизведение на iPhone.
      audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      void audio.play().catch(() => undefined);
    }
    setUnlocked(true);
  };
  const micDown = () => {
    if (!real || !actions) return;
    if (!room.active) actions.start();
    actions.speaking(true);
    void recorder.start();
  };
  const micUp = () => {
    if (!real || !actions || !recorder.recording) return;
    actions.speaking(false);
    recorder.stop();
  };
  const exit = () => {
    if (real && room.startedBy && room.startedBy === myId && room.participants.length <= 1) actions?.end();
    onClose();
  };
  const lastClipOf = (userId: string) => [...room.clips].reverse().find((c) => c.userId === userId);

  return createPortal(
    <div className="live-room fixed inset-0 z-[90] flex flex-col bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-foreground">{title}</h2>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="live-dot" />{room.participants.length} в эфире</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Закрыть эфир" onClick={exit} className="text-primary"><X /></Button>
      </header>

      {real && !unlocked ? (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={unlock}><Volume2 /> Слушать эфир</Button>
          <Button size="sm" variant="secondary" onClick={() => { setMuted(true); setUnlocked(true); }}><VolumeX /> без звука</Button>
        </div>
      ) : null}

      <div className="mt-3"><ClipBricks clips={room.clips} participants={room.participants} activeId={activeClip} onPick={playClip} /></div>

      <div className="relative mt-4 min-h-0 flex-1">
        <div className="live-table absolute inset-0 rounded-[2.5rem]" onClick={() => setPicked(null)}>
          {POCKETS.map(([x, y], i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); onInvite?.(); }}
              className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-[8px] font-semibold text-muted-foreground"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              + позвать
            </button>
          ))}
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {room.links.map((l) => {
              const a = pos.get(l.fromId);
              const b = pos.get(l.toId);
              if (!a || !b) return null;
              const fade = Math.max(0.15, 1 - (now - l.lastAt) / 60_000);
              const cx = (a[0] + b[0]) / 2 + (50 - (a[0] + b[0]) / 2) * 0.5;
              const cy = (a[1] + b[1]) / 2 + (50 - (a[1] + b[1]) / 2) * 0.5;
              return (
                <path
                  key={`${l.fromId}-${l.toId}`}
                  d={`M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`}
                  fill="none"
                  stroke="var(--primary)"
                  strokeOpacity={fade * Math.min(1, 0.3 + l.weight * 0.2)}
                  strokeWidth={Math.min(1.6, 0.3 + l.weight * 0.25)}
                  vectorEffect="non-scaling-stroke"
                  style={{ strokeWidth: Math.min(5, 1 + l.weight) }}
                />
              );
            })}
          </svg>
          {balls.map((p) => {
            const [x, y] = pos.get(p.userId)!;
            const glow = p.lastSpokeAt ? Math.max(0, 1 - (now - p.lastSpokeAt) / 60_000) : 0;
            return (
              <button
                key={p.userId}
                type="button"
                onClick={(e) => { e.stopPropagation(); setPicked(p); }}
                className="live-ball absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span className={cn("relative rounded-full", p.isSpeaking && "live-speaking")}>
                  <span className="absolute -inset-1 rounded-full shadow-glow transition-opacity duration-1000" style={{ opacity: p.isSpeaking ? 1 : glow }} />
                  <Avatar
                    name={p.name}
                    src={mediaUrl(p.avatarUrl) ?? null}
                    size="md"
                    className={cn("relative rounded-full border-2", p.isSpeaking ? "border-primary" : "border-border")}
                  />
                </span>
                <span className="max-w-16 truncate rounded-full bg-background/70 px-1.5 text-[10px] font-semibold text-foreground">{p.name.split(" ")[0]}</span>
              </button>
            );
          })}
          {extra > 0 ? (
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">+{extra}</span>
          ) : null}
        </div>

        {picked ? (
          <div className="absolute inset-x-4 bottom-4 z-10 rounded-3xl border border-border bg-card p-4 shadow-lift">
            <p className="font-bold text-foreground">{picked.name}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!lastClipOf(picked.userId)}
                onClick={() => { const c = lastClipOf(picked.userId); if (c) playClip(c); }}
              >
                Послушать последнее
              </Button>
              {picked.userId.startsWith("demo-") ? null : (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/profile/$id" params={{ id: picked.userId }}>Профиль</Link>
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-3">
        <Button size="icon" variant="secondary" aria-label={muted ? "Включить звук" : "Выключить звук"} onClick={() => setMuted((m) => !m)}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            aria-label="Держите, чтобы сказать"
            onPointerDown={(e) => { e.preventDefault(); micDown(); }}
            onPointerUp={micUp}
            onPointerLeave={micUp}
            onPointerCancel={micUp}
            onContextMenu={(e) => e.preventDefault()}
            className={cn("touch-none select-none", recorder.recording && "live-speaking", "grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow active:scale-95")}
          >
            <Mic className="size-8" />
          </button>
          <span className="text-[11px] text-muted-foreground">{recorder.recording ? `Говорите… ${recorder.seconds} с` : real ? (room.active ? "Держите, чтобы сказать" : "Держите, чтобы начать эфир") : `Держите, чтобы сказать · в очереди ${room.queue}`}</span>
        </div>
        <Button size="icon" variant="ghost" aria-label="Выйти из эфира" onClick={exit} className="text-primary"><LogOut /></Button>
      </footer>
    </div>,
    document.body,
  );
}
