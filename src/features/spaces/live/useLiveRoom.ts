import { RESUME_EVENT } from "@/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getToken, spacesApi } from "@/api";
import type { LiveCard } from "@/api/types";
import { toast } from "sonner";

import { applyCardEvent, dropOptimistic, restoreCard, upsertCard, type CardEvent } from "./cards";
import { resolveWsUrl } from "@/features/chat/useChatSocket";

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
  /** Сколько человек сейчас с открытым пространством (null — неизвестно). */
  online: number | null;
  /** Реальный эфир (не демо): доступны действия. */
  real?: boolean;
  startedBy?: string | null;
  /** Режим эфира (talk/work/learn/family/cinema); null — ещё не выбран. */
  mode?: string | null;
  actions?: LiveActions;
  /** Карточки на столе эфира. */
  cards: LiveCard[];
  cardActions?: LiveCardActions;
}

export interface LiveCardInput {
  kind: LiveCard["kind"];
  text?: string;
  url?: string;
  file?: File;
  /** Локальное превью фото для оптимистичного показа. */
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

export interface LiveSeedMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const EMPTY: LiveRoom = { active: false, participants: [], clips: [], links: [], speakingCount: 0, queue: 0, online: null, cards: [] };
const REPLY_WINDOW = 20_000;

/**
 * Комната «Эфир» пространства. Пока сервера нет — симуляция по таймерам в демо-режиме.
 * Интерфейс возвращаемого значения остаётся тем же для реальных данных.
 */
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

  // Демо: карточки только локально, без вызовов API.
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

interface ServerClip {
  id: string;
  userId: string;
  audioUrl: string;
  mime: string;
  durationMs: number;
  createdAt: string;
  clientTempId: string;
}
interface ServerState {
  active: boolean;
  startedBy: string | null;
  mode: string | null;
  participants: string[];
  speaking: string[];
  clips: ServerClip[];
  online: number | null;
  cards: LiveCard[];
}
const EMPTY_SERVER: ServerState = { active: false, startedBy: null, mode: null, participants: [], speaking: [], clips: [], online: null, cards: [] };

function toClip(c: ServerClip): LiveClip {
  return { id: c.id, userId: c.userId, durationMs: c.durationMs, createdAt: Date.parse(c.createdAt), audioUrl: c.audioUrl, clientTempId: c.clientTempId };
}

/** Связи «ответил на» по последовательности клипов. */
function linksFrom(clips: LiveClip[]): LiveLink[] {
  const map = new Map<string, LiveLink>();
  for (let i = 1; i < clips.length; i++) {
    const a = clips[i]!;
    const b = clips[i - 1]!;
    if (a.userId === b.userId || a.createdAt - b.createdAt > REPLY_WINDOW) continue;
    const key = `${a.userId}>${b.userId}`;
    const l = map.get(key);
    map.set(key, l ? { ...l, weight: l.weight + 1, lastAt: a.createdAt } : { fromId: a.userId, toId: b.userId, weight: 1, lastAt: a.createdAt });
  }
  return [...map.values()];
}

/** Настоящий эфир через /ws/live/:spaceId с переподключением 1→2→4…30 с. */
function useRealLiveRoom(spaceId: string, enabled: boolean, members: LiveSeedMember[]): LiveRoom {
  const [state, setState] = useState<ServerState>(EMPTY_SERVER);
  const [drafts, setDrafts] = useState<LiveClip[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const inLiveRef = useRef(false);

  useEffect(() => {
    if (!enabled) { setState(EMPTY_SERVER); return; }
    let closed = false;
    let attempt = 0;
    let timer: number | undefined;
    const connect = () => {
      const base = resolveWsUrl();
      const token = getToken();
      if (!base || !token) return;
      const ws = new WebSocket(`${base}/live/${encodeURIComponent(spaceId)}?token=${encodeURIComponent(token)}`);
      socketRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        if (inLiveRef.current) ws.send(JSON.stringify({ type: "join", spaceId }));
      };
      ws.onmessage = (e) => {
        let ev: Record<string, unknown>;
        try { ev = JSON.parse(String(e.data)) as Record<string, unknown>; } catch { return; }
        setState((prev) => {
          switch (ev["type"]) {
            case "snapshot": {
              const live = ev["live"] as { active: boolean; startedBy: string | null; mode?: string; participants: string[]; speaking: string[] };
              return { ...live, mode: live.mode ?? null, clips: (ev["clips"] as ServerClip[]) ?? [], online: Number(ev["online"]), cards: (ev["cards"] as LiveCard[] | undefined) ?? [] };
            }
            case "presence": return { ...prev, online: Number(ev["online"]) };
            case "live_started": return { ...prev, active: true, startedBy: String(ev["startedBy"]), mode: typeof ev["mode"] === "string" ? ev["mode"] : null, clips: [], cards: [] };
            case "card_added":
            case "card_updated":
            case "card_removed":
              return { ...prev, cards: applyCardEvent(prev.cards, ev as unknown as CardEvent) };
            case "live_ended": return { ...EMPTY_SERVER, online: prev.online };
            case "speaking": {
              const uid = String(ev["userId"]);
              const rest = prev.speaking.filter((x) => x !== uid);
              return { ...prev, speaking: ev["on"] ? [...rest, uid] : rest };
            }
            case "clip": {
              const clip = ev["clip"] as ServerClip;
              if (prev.clips.some((c) => c.id === clip.id)) return prev;
              setDrafts((d) => d.filter((x) => x.clientTempId !== clip.clientTempId));
              return { ...prev, clips: [...prev.clips, clip].slice(-60) };
            }
            default: return prev;
          }
        });
      };
      ws.onclose = (e) => {
        if (socketRef.current === ws) socketRef.current = null;
        if (closed || e.code === 4403 || e.code === 4401) return;
        const delay = Math.min(30_000, 1000 * 2 ** attempt++);
        timer = window.setTimeout(connect, delay);
      };
    };
    connect();
    const onResume = () => {
      if (closed || socketRef.current) return;
      window.clearTimeout(timer);
      attempt = 0;
      connect();
    };
    window.addEventListener(RESUME_EVENT, onResume);
    return () => {
      closed = true;
      window.removeEventListener(RESUME_EVENT, onResume);
      window.clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
      setState(EMPTY_SERVER);
      setDrafts([]);
    };
  }, [spaceId, enabled]);

  const send = useCallback((msg: object) => {
    const ws = socketRef.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }, []);

  const actions = useMemo<LiveActions>(() => ({
    start: (mode?: string) => { inLiveRef.current = true; send({ type: "start_live", ...(mode ? { mode } : {}) }); },
    end: () => { inLiveRef.current = false; send({ type: "end_live" }); },
    join: () => { inLiveRef.current = true; send({ type: "join", spaceId }); },
    leave: () => { inLiveRef.current = false; send({ type: "leave" }); },
    speaking: (on) => send({ type: "speaking", on }),
    addDraft: (clip) => setDrafts((d) => [...d, { ...clip, draft: true }]),
    dropDraft: (id) => setDrafts((d) => d.filter((x) => x.clientTempId !== id)),
  }), [send, spaceId]);

  // Карточки: показываем сразу, при ошибке откатываем и показываем тост (409 — «Эфир уже завершён»).
  const setCards = useCallback((fn: (cards: LiveCard[]) => LiveCard[]) => setState((p) => ({ ...p, cards: fn(p.cards) })), []);
  const fail = (error: unknown, fallback: string) => toast.error(error instanceof Error ? error.message : fallback);
  const cardActions = useMemo<LiveCardActions>(() => ({
    addCard: async (input) => {
      const clientTempId = crypto.randomUUID();
      const optimistic: LiveCard = {
        id: `temp-${clientTempId}`, kind: input.kind, authorId: "me", text: input.text ?? "",
        ...(input.url ? { url: input.url } : {}),
        ...(input.previewUrl ? { mediaUrl: input.previewUrl, mediaMime: "image/jpeg" } : {}),
        status: "open", createdAt: new Date().toISOString(), clientTempId,
      };
      setCards((c) => [...c, optimistic]);
      try {
        const saved = input.kind === "photo" && input.file
          ? await spacesApi.addLivePhotoCard(spaceId, input.file, clientTempId)
          : await spacesApi.addLiveCard(spaceId, {
            kind: input.kind as "note" | "link" | "question", clientTempId,
            ...(input.text ? { text: input.text } : {}), ...(input.url ? { url: input.url } : {}),
          });
        setCards((c) => upsertCard(c, saved));
        return true;
      } catch (error) {
        setCards((c) => dropOptimistic(c, clientTempId));
        fail(error, "Карточка не добавилась");
        return false;
      }
    },
    resolveCard: (card, status) => {
      setCards((c) => upsertCard(c, { ...card, status }));
      spacesApi.updateLiveCard(spaceId, card.id, status)
        .then((saved) => setCards((c) => upsertCard(c, saved)))
        .catch((error: unknown) => { setCards((c) => restoreCard(c, card)); fail(error, "Не удалось изменить карточку"); });
    },
    removeCard: (card) => {
      setCards((c) => c.filter((x) => x.id !== card.id));
      spacesApi.deleteLiveCard(spaceId, card.id)
        .catch((error: unknown) => { setCards((c) => restoreCard(c, card)); fail(error, "Не удалось удалить карточку"); });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [spaceId, setCards]);

  return useMemo<LiveRoom>(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    const clips = [
      ...state.clips.map(toClip),
      ...drafts.filter((d) => !state.clips.some((c) => c.clientTempId === d.clientTempId)),
    ];
    const lastSpoke = new Map<string, number>();
    for (const c of clips) lastSpoke.set(c.userId, c.createdAt);
    const ids = [...new Set([...state.participants, ...state.speaking])];
    const participants: LiveParticipant[] = ids.map((uid) => ({
      userId: uid,
      name: byId.get(uid)?.name ?? "Участник",
      avatarUrl: byId.get(uid)?.avatarUrl ?? null,
      isSpeaking: state.speaking.includes(uid),
      lastSpokeAt: lastSpoke.get(uid) ?? null,
    }));
    return {
      active: state.active,
      participants,
      clips,
      links: linksFrom(clips),
      speakingCount: state.speaking.length,
      queue: 0,
      online: state.online,
      real: true,
      startedBy: state.startedBy,
      mode: state.mode,
      actions,
      cards: state.cards,
      cardActions,
    };
  }, [state, drafts, members, actions, cardActions]);
}

const AUTHOR_COLORS = ["var(--primary)", "var(--community)", "var(--accent)", "var(--primary-ink)", "var(--community-ink)", "var(--primary-soft)"];
export function authorColor(userId: string, participants: LiveParticipant[]) {
  const i = Math.max(0, participants.findIndex((p) => p.userId === userId));
  return AUTHOR_COLORS[i % AUTHOR_COLORS.length];
}
