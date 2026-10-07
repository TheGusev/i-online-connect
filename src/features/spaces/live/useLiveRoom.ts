import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getToken } from "@/api";
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
  actions?: LiveActions;
}

export interface LiveActions {
  start: () => void;
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

const EMPTY: LiveRoom = { active: false, participants: [], clips: [], links: [], speakingCount: 0, queue: 0, online: null };
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

function useDemoLiveRoom(spaceId: string, opts: { demo: boolean; members: LiveSeedMember[] }): LiveRoom {
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
    setRoom({ active: true, participants: pool, clips: [], links: [], speakingCount: 0, queue: 1, online: null });

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
  participants: string[];
  speaking: string[];
  clips: ServerClip[];
  online: number | null;
}
const EMPTY_SERVER: ServerState = { active: false, startedBy: null, participants: [], speaking: [], clips: [], online: null };

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
              const live = ev["live"] as { active: boolean; startedBy: string | null; participants: string[]; speaking: string[] };
              return { ...live, clips: (ev["clips"] as ServerClip[]) ?? [], online: Number(ev["online"]) };
            }
            case "presence": return { ...prev, online: Number(ev["online"]) };
            case "live_started": return { ...prev, active: true, startedBy: String(ev["startedBy"]), clips: [] };
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
    return () => {
      closed = true;
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
    start: () => { inLiveRef.current = true; send({ type: "start_live" }); },
    end: () => { inLiveRef.current = false; send({ type: "end_live" }); },
    join: () => { inLiveRef.current = true; send({ type: "join", spaceId }); },
    leave: () => { inLiveRef.current = false; send({ type: "leave" }); },
    speaking: (on) => send({ type: "speaking", on }),
    addDraft: (clip) => setDrafts((d) => [...d, { ...clip, draft: true }]),
    dropDraft: (id) => setDrafts((d) => d.filter((x) => x.clientTempId !== id)),
  }), [send, spaceId]);

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
      actions,
    };
  }, [state, drafts, members, actions]);
}

const AUTHOR_COLORS = ["var(--primary)", "var(--community)", "var(--accent)", "var(--primary-ink)", "var(--community-ink)", "var(--primary-soft)"];
export function authorColor(userId: string, participants: LiveParticipant[]) {
  const i = Math.max(0, participants.findIndex((p) => p.userId === userId));
  return AUTHOR_COLORS[i % AUTHOR_COLORS.length];
}
