/**
 * WebSocket эфира пространства: ws(s)://<host>/ws/live/:spaceId?token=...
 *
 * Клиент → сервер: join {spaceId}, leave, start_live, end_live, speaking {on}.
 * Сервер → клиент: snapshot, presence {online}, live_started, live_ended,
 *                  speaking {userId,on}, clip {...}.
 *
 * Состояние в памяти процесса (как и у чата). Под PM2 cluster нужен общий канал.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

import { unlink } from "node:fs/promises";

import { query, queryOne } from "../db.ts";
import { mediaPathFromUrl } from "../media/store.ts";
import { clipFilesToDelete, staleSessionIds } from "../live/clips.ts";
import { verifyAccessToken } from "../auth/tokens.ts";

export interface LiveClipEvent {
  id: string;
  userId: string;
  audioUrl: string;
  mime: string;
  durationMs: number;
  createdAt: string;
  clientTempId: string;
}

interface Conn {
  userId: string;
  inLive: boolean;
  alive: boolean;
}

interface SpaceLive {
  conns: Map<WebSocket, Conn>;
  active: boolean;
  startedBy: string | null;
  startedAt: string | null;
  speaking: Set<string>;
  clips: LiveClipEvent[];
  sessionId: string | null;
  starting: boolean;
  endTimer: NodeJS.Timeout | null;
}

const END_AFTER_EMPTY_MS = 60_000;
const spaces = new Map<string, SpaceLive>();

function stateOf(spaceId: string): SpaceLive {
  let s = spaces.get(spaceId);
  if (!s) {
    s = { conns: new Map(), active: false, startedBy: null, startedAt: null, speaking: new Set(), clips: [], sessionId: null, starting: false, endTimer: null };
    spaces.set(spaceId, s);
  }
  return s;
}

function broadcast(s: SpaceLive, event: object) {
  const payload = JSON.stringify(event);
  for (const socket of s.conns.keys()) if (socket.readyState === 1) socket.send(payload);
}

function unique(s: SpaceLive, onlyLive = false) {
  const ids = new Set<string>();
  for (const c of s.conns.values()) if (!onlyLive || c.inLive) ids.add(c.userId);
  return [...ids];
}

function snapshot(s: SpaceLive, spaceId: string) {
  return {
    type: "snapshot",
    spaceId,
    live: { active: s.active, startedBy: s.startedBy, startedAt: s.startedAt, participants: unique(s, true), speaking: [...s.speaking] },
    online: unique(s).length,
    onlineIds: unique(s),
    clips: s.clips.slice(-20),
  };
}

/** Закрыть сессию: удалить файлы и строки клипов, поставить ended_at. Не бросает. */
export async function closeLiveSession(sessionId: string): Promise<void> {
  try {
    const rows = await query<{ media_url: string }>("SELECT media_url FROM live_clips WHERE session_id = $1", [sessionId]);
    for (const file of clipFilesToDelete(rows.map((r) => r.media_url), mediaPathFromUrl)) {
      await unlink(file).catch(() => undefined);
    }
    await query("DELETE FROM live_clips WHERE session_id = $1", [sessionId]);
    await query("UPDATE live_sessions SET ended_at = now() WHERE id = $1 AND ended_at IS NULL", [sessionId]);
  } catch (error) {
    console.error("[live] Не удалось закрыть сессию", sessionId, (error as Error).message);
  }
}

function endLive(s: SpaceLive, spaceId: string) {
  if (s.endTimer) clearTimeout(s.endTimer);
  s.endTimer = null;
  if (!s.active) return;
  if (s.sessionId) void closeLiveSession(s.sessionId);
  s.sessionId = null;
  s.clips = [];
  s.active = false;
  s.startedBy = null;
  s.startedAt = null;
  s.speaking.clear();
  for (const c of s.conns.values()) c.inLive = false;
  broadcast(s, { type: "live_ended", spaceId });
}

/** Пересчитать «в эфире»: если никого не осталось — завершить через 60 с. */
function checkEmpty(s: SpaceLive, spaceId: string) {
  if (!s.active) return;
  if (unique(s, true).length > 0) {
    if (s.endTimer) clearTimeout(s.endTimer);
    s.endTimer = null;
    return;
  }
  if (!s.endTimer) s.endTimer = setTimeout(() => endLive(s, spaceId), END_AFTER_EMPTY_MS);
}

/** Идёт ли эфир в пространстве. */
export function isLiveActive(spaceId: string): boolean {
  return spaces.get(spaceId)?.active ?? false;
}

/** id текущей сессии эфира (или null). */
export function getLiveSessionId(spaceId: string): string | null {
  const s = spaces.get(spaceId);
  return s?.active ? s.sessionId : null;
}

async function closeSessions(ids: string[]) {
  for (const id of ids) await closeLiveSession(id);
}

/** Зависшие открытые сессии и клипы старых сессий (>24 ч). */
async function sweep(includeAll: boolean) {
  try {
    const open = await query<{ id: string }>("SELECT id FROM live_sessions WHERE ended_at IS NULL");
    const active = [...spaces.values()].map((s) => s.sessionId).filter((x): x is string => Boolean(x));
    await closeSessions(includeAll ? open.map((r) => r.id) : staleSessionIds(open.map((r) => r.id), active));
    const old = await query<{ id: string }>(
      "SELECT DISTINCT s.id FROM live_sessions s JOIN live_clips c ON c.session_id = s.id WHERE s.ended_at < now() - interval '24 hours'",
    );
    await closeSessions(old.map((r) => r.id));
  } catch (error) {
    console.error("[live] Ошибка очистки сессий:", (error as Error).message);
  }
}

/** Разослать новый клип эфира (вызывается из POST /spaces/:id/voice). */
export function publishLiveClip(spaceId: string, clip: LiveClipEvent): void {
  const s = spaces.get(spaceId);
  if (!s?.active) return;
  s.clips = [...s.clips, clip].slice(-20);
  broadcast(s, { type: "clip", spaceId, clip });
}

export async function liveSocketRoutes(app: FastifyInstance) {
  // Общий heartbeat: кто не ответил pong за 30 с — закрываем.
  const heartbeat = setInterval(() => {
    for (const s of spaces.values()) {
      for (const [socket, c] of s.conns) {
        if (!c.alive) { socket.terminate(); continue; }
        c.alive = false;
        if (socket.readyState === 1) socket.ping();
      }
    }
  }, 30_000);
  // После рестарта память пуста — закрываем всё открытое; дальше уборка раз в час.
  void sweep(true);
  const cleanup = setInterval(() => void sweep(false), 60 * 60_000);
  app.addHook("onClose", async () => { clearInterval(heartbeat); clearInterval(cleanup); });

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    "/live/:id",
    { websocket: true },
    async (socket, request) => {
      const spaceId = request.params.id;
      const token = request.query.token;
      if (!token || !/^[0-9a-f-]{36}$/i.test(spaceId)) { socket.close(4401, "no token"); return; }
      let userId: string;
      try { userId = (await verifyAccessToken(token)).sub; } catch { socket.close(4401, "bad token"); return; }
      const member = await queryOne(
        "SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2 AND status IN ('host', 'member')",
        [spaceId, userId],
      );
      if (!member) { socket.close(4403, "forbidden"); return; }

      const s = stateOf(spaceId);
      const conn: Conn = { userId, inLive: false, alive: true };
      s.conns.set(socket, conn);
      socket.on("pong", () => { conn.alive = true; });
      socket.send(JSON.stringify(snapshot(s, spaceId)));
      broadcast(s, { type: "presence", spaceId, online: unique(s).length, onlineIds: unique(s) });

      const setSpeaking = (on: boolean) => {
        const had = s.speaking.has(userId);
        if (on && s.active && conn.inLive) s.speaking.add(userId);
        else s.speaking.delete(userId);
        if (had !== s.speaking.has(userId)) broadcast(s, { type: "speaking", spaceId, userId, on: s.speaking.has(userId) });
      };

      socket.on("message", (raw: Buffer) => {
        let msg: { type?: string; on?: boolean };
        try { msg = JSON.parse(raw.toString()) as typeof msg; } catch { return; }
        conn.alive = true;
        switch (msg.type) {
          case "join":
            if (!s.active) return;
            conn.inLive = true;
            checkEmpty(s, spaceId);
            broadcast(s, snapshot(s, spaceId));
            break;
          case "leave":
            conn.inLive = false;
            setSpeaking(false);
            checkEmpty(s, spaceId);
            broadcast(s, snapshot(s, spaceId));
            break;
          case "start_live":
            if (s.active) {
              conn.inLive = true;
              checkEmpty(s, spaceId);
              broadcast(s, snapshot(s, spaceId));
              break;
            }
            if (s.starting) break;
            s.starting = true;
            void (async () => {
              try {
                const row = await queryOne<{ id: string; started_at: Date }>(
                  "INSERT INTO live_sessions (space_id, started_by) VALUES ($1, $2) RETURNING id, started_at",
                  [spaceId, userId],
                );
                if (!row) return;
                s.sessionId = row.id;
                s.active = true;
                s.startedBy = userId;
                s.startedAt = row.started_at.toISOString();
                s.clips = [];
                broadcast(s, { type: "live_started", spaceId, startedBy: userId, startedAt: s.startedAt });
                if (s.conns.has(socket)) conn.inLive = true;
                checkEmpty(s, spaceId);
                broadcast(s, snapshot(s, spaceId));
              } catch (error) {
                console.error("[live] Не удалось начать эфир:", (error as Error).message);
              } finally {
                s.starting = false;
              }
            })();
            break;
          case "end_live":
            if (s.startedBy === userId) endLive(s, spaceId);
            break;
          case "speaking":
            setSpeaking(Boolean(msg.on));
            break;
        }
      });

      socket.on("close", () => {
        s.conns.delete(socket);
        if (![...s.conns.values()].some((c) => c.userId === userId)) {
          if (s.speaking.delete(userId)) broadcast(s, { type: "speaking", spaceId, userId, on: false });
        }
        checkEmpty(s, spaceId);
        broadcast(s, { type: "presence", spaceId, online: unique(s).length, onlineIds: unique(s) });
        if (s.conns.size === 0 && !s.active && !s.starting) spaces.delete(spaceId);
      });
    },
  );
}
