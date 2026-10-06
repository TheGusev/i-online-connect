import { useEffect, useRef, useState } from "react";

export interface LiveParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isSpeaking: boolean;
  lastSpokeAt: number | null;
}
export interface LiveClip {
  id: string;
  userId: string;
  durationMs: number;
  createdAt: number;
  audioUrl?: string;
}
export interface LiveLink {
  fromId: string;
  toId: string;
  weight: number;
  lastAt: number;
}
export interface LiveRoom {
  active: boolean;
  participants: LiveParticipant[];
  clips: LiveClip[];
  links: LiveLink[];
  speakingCount: number;
  queue: number;
}

export interface LiveSeedMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const EMPTY: LiveRoom = { active: false, participants: [], clips: [], links: [], speakingCount: 0, queue: 0 };
const REPLY_WINDOW = 20_000;

/**
 * Комната «Эфир» пространства. Пока сервера нет — симуляция по таймерам в демо-режиме.
 * Интерфейс возвращаемого значения остаётся тем же для реальных данных.
 */
export function useLiveRoom(spaceId: string, opts: { demo: boolean; members: LiveSeedMember[] }): LiveRoom {
  const [room, setRoom] = useState<LiveRoom>(EMPTY);
  const membersRef = useRef(opts.members);
  membersRef.current = opts.members;

  useEffect(() => {
    if (!opts.demo) {
      setRoom(EMPTY);
      return;
    }
    const base = membersRef.current.slice(0, 12);
    const fallback = ["Аня", "Илья", "Марина", "Олег", "Катя", "Денис"].map((name, i) => ({
      id: `demo-${i}`,
      name,
      avatarUrl: null,
    }));
    const pool = (base.length >= 3 ? base : [...base, ...fallback].slice(0, 6)).map((m) => ({
      userId: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      isSpeaking: false,
      lastSpokeAt: null as number | null,
    }));
    setRoom({ active: true, participants: pool, clips: [], links: [], speakingCount: 0, queue: 1 });

    let n = 0;
    let stopTimer: number | undefined;
    const tick = () => {
      setRoom((prev) => {
        const now = Date.now();
        const last = prev.clips[prev.clips.length - 1];
        const candidates = prev.participants.filter((p) => p.userId !== last?.userId);
        const speaker = candidates[Math.floor(Math.random() * candidates.length)];
        if (!speaker) return prev;
        const durationMs = 1500 + Math.random() * 5000;
        const clip: LiveClip = { id: `${spaceId}-${n++}`, userId: speaker.userId, durationMs, createdAt: now };
        let links = prev.links
          .map((l) => ({ ...l, weight: now - l.lastAt > 45_000 ? Math.max(0, l.weight - 1) : l.weight }))
          .filter((l) => l.weight > 0);
        if (last && now - last.createdAt < REPLY_WINDOW) {
          const existing = links.find((l) => l.fromId === speaker.userId && l.toId === last.userId);
          if (existing) links = links.map((l) => (l === existing ? { ...l, weight: l.weight + 1, lastAt: now } : l));
          else links = [...links, { fromId: speaker.userId, toId: last.userId, weight: 1, lastAt: now }];
        }
        window.clearTimeout(stopTimer);
        stopTimer = window.setTimeout(() => {
          setRoom((p) => ({
            ...p,
            speakingCount: 0,
            participants: p.participants.map((x) => ({ ...x, isSpeaking: false })),
          }));
        }, durationMs);
        return {
          ...prev,
          clips: [...prev.clips, clip].slice(-60),
          links,
          speakingCount: 1,
          queue: Math.floor(Math.random() * 3),
          participants: prev.participants.map((p) =>
            p.userId === speaker.userId ? { ...p, isSpeaking: true, lastSpokeAt: now } : { ...p, isSpeaking: false },
          ),
        };
      });
    };
    tick();
    const interval = window.setInterval(tick, 7000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopTimer);
    };
  }, [spaceId, opts.demo]);

  return room;
}

const AUTHOR_COLORS = ["var(--primary)", "var(--community)", "var(--accent)", "var(--primary-ink)", "var(--community-ink)", "var(--primary-soft)"];
export function authorColor(userId: string, participants: LiveParticipant[]) {
  const i = Math.max(0, participants.findIndex((p) => p.userId === userId));
  return AUTHOR_COLORS[i % AUTHOR_COLORS.length];
}
