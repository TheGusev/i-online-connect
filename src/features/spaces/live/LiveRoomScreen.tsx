import { Link } from "@tanstack/react-router";
import { LogOut, Mic, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { mediaUrl } from "@/api";
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
  room,
  onClose,
  onInvite,
}: {
  open: boolean;
  title: string;
  room: LiveRoom;
  onClose: () => void;
  onInvite?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<LiveParticipant | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

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

  const playClip = (clip: LiveClip) => {
    setActiveClip(clip.id);
    if (clip.audioUrl && !muted) void new Audio(clip.audioUrl).play().catch(() => undefined);
    window.setTimeout(() => setActiveClip((c) => (c === clip.id ? null : c)), clip.durationMs);
  };
  const lastClipOf = (userId: string) => [...room.clips].reverse().find((c) => c.userId === userId);

  return createPortal(
    <div className="live-room fixed inset-0 z-[90] flex flex-col bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-foreground">{title}</h2>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="live-dot" />{room.participants.length} в эфире</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Закрыть эфир" onClick={onClose} className="text-primary"><X /></Button>
      </header>

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
          <button type="button" aria-label="Держите, чтобы сказать" className="grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow active:scale-95">
            <Mic className="size-8" />
          </button>
          <span className="text-[11px] text-muted-foreground">Держите, чтобы сказать · в очереди {room.queue}</span>
        </div>
        <Button size="icon" variant="ghost" aria-label="Выйти из эфира" onClick={onClose} className="text-primary"><LogOut /></Button>
      </footer>
    </div>,
    document.body,
  );
}
