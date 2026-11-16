import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../env.ts";
import { queryOne } from "../db.ts";
import { verifyAccessToken } from "../auth/tokens.ts";

const COOKIE = "__Host-ya_media";
const prefixes = [...new Set([
  "/media/",
  "/api/media-file/",
  "/uploads/",
  new URL(env.MEDIA_BASE_URL, env.PUBLIC_BASE_URL).pathname.replace(/\/?$/, "/"),
])];

function privateFile(raw: string): string | null {
  const pathname = new URL(raw, "http://local").pathname;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); }
  catch { return "!invalid"; }

  if (decoded.startsWith("/api/chat-video-poster/")) {
    const match = /^\/api\/chat-video-poster\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/i.exec(decoded);
    return match ? `chat/${match[1]}/${match[2]}.mp4` : "!invalid";
  }

  const prefix = prefixes.find(p => decoded.startsWith(p));
  if (!prefix) return null;
  const relative = decoded.slice(prefix.length);
  if (!/^(chat|voice)(\/|$)/i.test(relative)) return null;

  return /^(chat|voice)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(relative)
    ? relative
    : "!invalid";
}

function candidates(relative: string): string[] {
  const result = new Set<string>();
  for (const prefix of prefixes) {
    const path = `${prefix}${relative}`;
    result.add(path);
    result.add(new URL(path, env.PUBLIC_BASE_URL).toString());
  }
  result.add(`${env.MEDIA_BASE_URL.replace(/\/$/, "")}/${relative}`);
  return [...result];
}

async function allowed(userId: string, urls: string[]): Promise<boolean> {
  const row = await queryOne<{ allowed: boolean }>(`
    SELECT (
      EXISTS (
        SELECT 1 FROM messages m
        JOIN conversation_participants cp
          ON cp.conversation_id = m.conversation_id
        WHERE m.media_url = ANY($2::text[])
          AND m.kind::text IN ('image','video','voice')
          AND m.deleted_at IS NULL AND cp.user_id = $1
      )
      OR EXISTS (
        SELECT 1 FROM space_messages m
        JOIN space_members sm ON sm.space_id = m.space_id
        WHERE m.media_url = ANY($2::text[])
          AND m.kind IN ('image','video','voice')
          AND m.deleted_at IS NULL
          AND sm.user_id = $1 AND sm.status IN ('member','host')
      )
      OR EXISTS (
        SELECT 1 FROM live_cards c
        JOIN live_sessions s ON s.id = c.session_id
        JOIN space_members sm ON sm.space_id = s.space_id
        WHERE c.media_url = ANY($2::text[])
          AND s.ended_at IS NULL
          AND sm.user_id = $1 AND sm.status IN ('member','host')
      )
      OR EXISTS (
        SELECT 1 FROM live_clips c
        JOIN live_sessions s ON s.id = c.session_id
        JOIN space_members sm ON sm.space_id = s.space_id
        WHERE c.media_url = ANY($2::text[])
          AND s.ended_at IS NULL
          AND sm.user_id = $1 AND sm.status IN ('member','host')
      )
    ) AS allowed`, [userId, urls]);
  return row?.allowed === true;
}

export function registerPrivateMediaGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const file = privateFile(request.raw.url ?? request.url);
    if (file === null) return;

    reply.header("Cache-Control", "private, no-store");
    reply.header("Vary", "Cookie, Authorization");
    reply.header("X-Content-Type-Options", "nosniff");

    if (file === "!invalid") return reply.code(404).send({ message: "Не найдено" });

    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : request.cookies[COOKIE];

    if (!token) return reply.code(401).send({ message: "Нужен вход" });

    let userId: string;
    try { userId = (await verifyAccessToken(token)).sub; }
    catch { return reply.code(401).send({ message: "Сессия истекла" }); }

    const user = await queryOne(
      `SELECT 1 FROM users
       WHERE id = $1 AND deleted_at IS NULL AND blocked_at IS NULL`,
      [userId],
    );
    if (!user || !(await allowed(userId, candidates(file)))) {
      return reply.code(403).send({ message: "Нет доступа" });
    }
  });

  // onRequest above authorizes this JPEG against its parent MP4 message.
  app.get<{ Params: { userId: string; name: string } }>(
    "/api/chat-video-poster/:userId/:name",
    async (request, reply) => {
      const { userId, name } = request.params;
      if (!/^[0-9a-f-]{36}$/i.test(userId) ||
          !/^[0-9a-f-]{36}\.jpg$/i.test(name)) {
        return reply.code(404).send({ message: "Не найдено" });
      }
      try {
        const buffer = await readFile(
          path.join(env.MEDIA_DIR, "chat", userId, name),
        );
        return reply
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", "private, no-store")
          .header("Vary", "Cookie, Authorization")
          .header("X-Content-Type-Options", "nosniff")
          .send(buffer);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return reply.code(404).send({ message: "Превью отсутствует" });
        }
        throw error;
      }
    },
  );

  app.addHook("onSend", async (request, reply, payload) => {
    const pathname = new URL(request.url, "http://local").pathname;

    if (privateFile(request.raw.url ?? request.url) !== null) {
      reply.header("Cache-Control", "private, no-store");
      reply.header("Vary", "Cookie, Authorization");
    }

    if (pathname === "/api/auth/logout") {
      reply.clearCookie(COOKIE, {
        path: "/", secure: true, httpOnly: true, sameSite: "strict",
      });
      return payload;
    }

    if (!pathname.startsWith("/api/") || reply.statusCode >= 400) return payload;

    let token: string | undefined;
    const auth = request.headers.authorization;
    if (auth?.startsWith("Bearer ")) token = auth.slice(7).trim();

    if (pathname.startsWith("/api/auth/") && typeof payload === "string") {
      try {
        const body = JSON.parse(payload) as { token?: unknown };
        if (typeof body.token === "string") token = body.token;
      } catch { /* не JSON */ }
    }

    if (token && request.cookies[COOKIE] !== token) {
      try {
        await verifyAccessToken(token);
        reply.setCookie(COOKIE, token, {
          path: "/", secure: true, httpOnly: true,
          sameSite: "strict", maxAge: 900,
        });
      } catch { /* не выдаём cookie для неверного токена */ }
    }
    return payload;
  });
}
