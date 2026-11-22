import { RESUME_EVENT, getToken, spacesApi } from "@/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveCard } from "@/api/types";
import { toast } from "sonner";
import { applyCardEvent, dropOptimistic, restoreCard, upsertCard } from "./cards";
import { resolveWsUrl } from "@/features/chat/useChatSocket";
import { getSessionRevision, isSessionCurrent } from "@/api/client";
import { subscribeSessionChanges } from "@/api/session-scope.mjs";
import { useSessionStore } from "@/store/useSessionStore";
import { createRealLiveRoomHook } from "./real-live-room.mjs";

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
  clientTempId?: string;
  /** Черновик: ещё отправляется. */
  draft?: boolean;
}
export interface LiveLink { fromId: string; toId: string; weight: number; lastAt: number; }
export interface LiveRoom {
  active: boolean;
  participants: LiveParticipant[];
  clips: LiveClip[];
  links: LiveLink[];
  speakingCount: number;
  queue: number;
  online: number | null;
  real?: boolean;
  startedBy?: string | null;
  mode?: string | null;
  actions?: LiveActions;
  cards: LiveCard[];
  cardActions?: LiveCardActions;
}
export interface LiveCardInput {
  kind: LiveCard["kind"];
  text?: string;
  url?: string;
  file?: File;
  previewUrl?: string;
}
export interface LiveCardActions {
  addCard: (input: LiveCardInput) => Promise<boolean>;
  resolveCard: (card: LiveCard, status: LiveCard["status"]) => void;
  removeCard: (card: LiveCard) => void;
}
export interface LiveActions {
  start: (mode?: string) => void;
  end: () => void;
  join: () => void;
  leave: () => void;
  speaking: (on: boolean) => void;
  addDraft: (clip: LiveClip) => void;
  dropDraft: (clientTempId: string) => void;
}
export interface LiveSeedMember { id: string; name: string; avatarUrl: string | null; }
const EMPTY: LiveRoom = { active: false, participants: [], clips: [], links: [], speakingCount: 0, queue: 0, online: null, cards: [] };
const REPLY_WINDOW = 20_000;

export function useLiveRoom(spaceId: string, opts: { demo: boolean; members: LiveSeedMember[] }): LiveRoom {
  const real = useRealLiveRoom(spaceId, !opts.demo, opts.members);
  const demo = useDemoLiveRoom(spaceId, opts);
  return opts.demo ? demo : real;
}
function demoCards(authorId: string): LiveCard[] {
  const at = new Date().toISOString();
  return [
    { id: "demo-card-1", kind: "note", authorId, text: "Встречаемся в субботу в 12:00 у входа в парк", status: "open", createdAt: at, clientTempId: "demo-1" },
    { id: "demo-card-2", kind: "question", authorId, text: "Кто возьмёт настольные игры?", status: "open", createdAt: at, clientTempId: "demo-2" },
    { id: "demo-card-3", kind: "link", authorId, text: "Маршрут прогулки", url: "https://yandex.ru/maps", domain: "yandex.ru", status: "open", createdAt: at, clientTempId: "demo-3" },
  ];
}
function useDemoLiveRoom(spaceId: string, opts: { demo: boolean; members: LiveSeedMember[] }): LiveRoom {
  const [room, setRoom] = useState<LiveRoom>(EMPTY);
  const [cards, setCards] = useState<LiveCard[]>([]);
  const membersRef = useRef(opts.members);
  membersRef.current = opts.members;
  useEffect(() => {
    if (!opts.demo) { setRoom(EMPTY); return; }
    const base = membersRef.current.slice(0, 12);
    const fallback = ["Аня", "Илья", "Марина", "Олег", "Катя", "Денис"].map((name, i) => ({ id: `demo-${i}`, name, avatarUrl: null }));
    const pool = (base.length >= 3 ? base : [...base, ...fallback].slice(0, 6)).map((m) => ({
      userId: m.id, name: m.name, avatarUrl: m.avatarUrl, isSpeaking: false, lastSpokeAt: null as number | null,
    }));
    setRoom({ active: true, participants: pool, clips: [], links: [], speakingCount: 0, queue: 1, online: null, cards: [] });
    setCards(demoCards(pool[0]?.userId ?? "demo-0"));
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
        let links = prev.links.map((l) => ({ ...l, weight: now - l.lastAt > 45_000 ? Math.max(0, l.weight - 1) : l.weight })).filter((l) => l.weight > 0);
        if (last && now - last.createdAt < REPLY_WINDOW) {
          const existing = links.find((l) => l.fromId === speaker.userId && l.toId === last.userId);
          if (existing) links = links.map((l) => (l === existing ? { ...l, weight: l.weight + 1, lastAt: now } : l));
          else links = [...links, { fromId: speaker.userId, toId: last.userId, weight: 1, lastAt: now }];
        }
        window.clearTimeout(stopTimer);
        stopTimer = window.setTimeout(() => {
          setRoom((p) => ({ ...p, speakingCount: 0, participants: p.participants.map((x) => ({ ...x, isSpeaking: false })) }));
        }, durationMs);
        return { ...prev, clips: [...prev.clips, clip].slice(-60), links, speakingCount: 1, queue: Math.floor(Math.random() * 3),
          participants: prev.participants.map((p) => p.userId === speaker.userId ? { ...p, isSpeaking: true, lastSpokeAt: now } : { ...p, isSpeaking: false }),
        };
      });
    };
    tick();
    const interval = window.setInterval(tick, 7000);
    return () => { window.clearInterval(interval); window.clearTimeout(stopTimer); };
  }, [spaceId, opts.demo]);
  const cardActions = useMemo<LiveCardActions>(() => ({
    addCard: async (input) => {
      const clientTempId = crypto.randomUUID();
      const link = input.kind === "link" && input.url ? new URL(input.url) : null;
      setCards((c) => [...c, {
        id: `demo-${clientTempId}`, kind: input.kind, authorId: "me", text: input.text ?? "",
        ...(link ? { url: link.toString(), domain: link.hostname.replace(/^www\./, "") } : {}),
        ...(input.previewUrl ? { mediaUrl: input.previewUrl, mediaMime: "image/jpeg" } : {}),
        status: "open", createdAt: new Date().toISOString(), clientTempId,
      }]);
      return true;
    },
    resolveCard: (card, status) => setCards((c) => c.map((x) => (x.id === card.id ? { ...x, status } : x))),
    removeCard: (card) => setCards((c) => c.filter((x) => x.id !== card.id)),
  }), []);
  return useMemo(() => ({ ...room, cards: opts.demo ? cards : [], cardActions }), [room, cards, cardActions, opts.demo]);
}

const useRealLiveRoom = createRealLiveRoomHook({
  react: { useState, useRef, useMemo, useEffect, useCallback },
  session: { getToken, getRevision: getSessionRevision, isCurrent: isSessionCurrent,
    subscribe: listener => subscribeSessionChanges(getToken, listener) },
  api: spacesApi, cards: { applyCardEvent, dropOptimistic, restoreCard, upsertCard },
  useSessionStore, resolveWsUrl, resumeEvent: RESUME_EVENT,
  getWindow: () => typeof window === "undefined" ? undefined : window,
  createSocket: url => new WebSocket(url), randomUUID: () => crypto.randomUUID(),
  showError: message => { toast.error(message); },
});
const AUTHOR_COLORS = ["var(--primary)", "var(--community)", "var(--accent)", "var(--primary-ink)", "var(--community-ink)", "var(--primary-soft)"];
export function authorColor(userId: string, participants: LiveParticipant[]) {
  const i = Math.max(0, participants.findIndex((p) => p.userId === userId));
  return AUTHOR_COLORS[i % AUTHOR_COLORS.length];
}
