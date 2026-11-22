import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { query, queryOne, transaction } from "../db.ts";
import { HttpError, badRequest, forbidden, notFound } from "../http.ts";
import { prepareStoryMedia, removeStoryFile, storyFiles, storyPath } from "../stories/media.ts";

const idParams = z.object({ id: z.string().uuid() });

/** Pair is a real two-person conversation, never notes or a group. */
const contact = (viewer: string, author: string) => `
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN conversation_participants mine
      ON mine.conversation_id=c.id AND mine.user_id=${viewer}
    JOIN conversation_participants theirs
      ON theirs.conversation_id=c.id AND theirs.user_id=${author}
    WHERE c.notes_owner_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM conversation_participants extra
        WHERE extra.conversation_id=c.id
          AND extra.user_id NOT IN (${viewer},${author})
      )
  )`;

const access = `
  s.deleted_at IS NULL AND s.expires_at>now()
  AND u.deleted_at IS NULL AND u.blocked_at IS NULL
  AND u.paused_at IS NULL AND p.is_seed=false
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.user_id=$1 AND b.blocked_id=s.author_id)
       OR (b.user_id=s.author_id AND b.blocked_id=$1)
  )
  AND (
    s.author_id=$1 OR (
      EXISTS (SELECT 1 FROM story_audience a WHERE a.story_id=s.id AND a.user_id=$1)
      AND ${contact("$1", "s.author_id")}
    )
  )`;

const selection = `
  SELECT s.*, s.created_at::text AS cursor_at, p.name AS author_name,
    (SELECT pm.url FROM profile_media pm
     WHERE pm.user_id=s.author_id AND pm.kind='photo'
     ORDER BY pm.is_primary DESC,pm.position LIMIT 1) AS avatar_url,
    EXISTS(SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.user_id=$1) AS seen,
    CASE WHEN s.author_id=$1
      THEN (SELECT count(*)::int FROM story_views v
            WHERE v.story_id=s.id AND v.user_id<>$1)
      ELSE NULL END AS view_count
  FROM story_posts s
  JOIN users u ON u.id=s.author_id
  JOIN profiles p ON p.user_id=s.author_id`;

interface StoryRow {
  id: string; author_id: string; author_name: string;
  avatar_url: string | null; kind: "image" | "video";
  caption: string; duration_ms: number | null;
  created_at: Date; expires_at: Date; cursor_at: string;
  seen: boolean; view_count: number | null;
  file_key: string; mime: string; file_size: number;
}
function dto(row: StoryRow, viewer: string) {
  return {
    id: row.id, author: {
      id: row.author_id, name: row.author_name, avatarUrl: row.avatar_url,
    },
    kind: row.kind, caption: row.caption, durationMs: row.duration_ms,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    seen: row.seen, mine: row.author_id === viewer,
    ...(row.author_id === viewer ? { viewCount: row.view_count ?? 0 } : {}),
    mediaPath: `/stories/${row.id}/media`,
  };
}
let uploading = false;

export async function storyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    await requireAuth(request, reply);
    const active = await queryOne(
      `SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id
       WHERE u.id=$1 AND u.deleted_at IS NULL AND u.blocked_at IS NULL
         AND u.paused_at IS NULL AND p.is_seed=false`,
      [currentUserId(request)],
    );
    if (!active) throw forbidden("Истории недоступны для этого аккаунта");
    reply.header("Cache-Control", "private, no-store");
    reply.header("Vary", "Origin, Authorization");
  });

  app.get("/", async request => {
    const viewer = currentUserId(request);
    const filters = z.object({
      beforeAt: z.string().max(64).optional(),
      beforeId: z.string().uuid().optional(),
    }).parse(request.query ?? {});
    if (Boolean(filters.beforeAt) !== Boolean(filters.beforeId) ||
        (filters.beforeAt && !Number.isFinite(Date.parse(filters.beforeAt)))) {
      throw badRequest("Некорректный курсор историй");
    }
    const rows = await query<StoryRow>(
      `${selection} WHERE ${access}
       AND ($2::timestamptz IS NULL OR (s.created_at,s.id)<($2::timestamptz,$3::uuid))
       ORDER BY s.created_at DESC,s.id DESC LIMIT 101`,
      [viewer, filters.beforeAt ?? null, filters.beforeId ?? null],
    );
    const unread = await queryOne<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM story_posts s
       JOIN users u ON u.id=s.author_id
       JOIN profiles p ON p.user_id=s.author_id
       WHERE ${access} AND s.author_id<>$1
         AND NOT EXISTS (
           SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.user_id=$1
         )`,
      [viewer],
    );
    const page = rows.slice(0, 100), last = page.at(-1);
    return {
      unseenCount: unread?.count ?? 0,
      items: page.map(row => dto(row, viewer)),
      nextCursor: rows.length > 100 && last
        ? { at: last.cursor_at, id: last.id } : null,
    };
  });

  app.post("/", {
    config: { rateLimit: { max: 12, timeWindow: "1 hour" } },
  }, async request => {
    if (uploading) throw new HttpError(503, "Обработка истории занята. Повторите чуть позже");
    uploading = true;
    let saved: Awaited<ReturnType<typeof prepareStoryMedia>> | undefined;
    try {
      const author = currentUserId(request);
      let buffer: Buffer | undefined, clientTempId = "", caption = "";
      const fields = new Set<string>();
      for await (const part of request.parts({
        limits: { fileSize: 40 * 1024 * 1024, files: 1, fields: 2 },
      })) {
        if (fields.has(part.fieldname)) throw badRequest("Повтор поля загрузки");
        fields.add(part.fieldname);
        if (part.type === "file") {
          if (part.fieldname !== "file") throw badRequest("Ожидается поле file");
          buffer = await part.toBuffer();
          if (part.file.truncated) throw badRequest("Файл больше 40 МБ");
        } else if (part.fieldname === "clientTempId") {
          clientTempId = z.string().uuid().parse(String(part.value));
        } else if (part.fieldname === "caption") {
          caption = z.string().trim().max(280).parse(String(part.value));
        } else throw badRequest("Неизвестное поле загрузки");
      }
      if (!buffer || !clientTempId) throw badRequest("Нужны файл и clientTempId");
      const data = buffer;
      const hash = createHash("sha256").update(data).update("\0").update(caption).digest("hex");

      return await transaction(async client => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`story-publish:${author}`],
        );
        const old = (await client.query<{
          id: string; source_hash: string; deleted_at: Date | null; expires_at: Date;
        }>(
          "SELECT id,source_hash,deleted_at,expires_at FROM story_posts WHERE author_id=$1 AND client_temp_id=$2",
          [author, clientTempId],
        )).rows[0];
        if (old) {
          if (old.source_hash !== hash || old.deleted_at || old.expires_at.getTime() <= Date.now()) {
            throw new HttpError(409, "Этот запрос публикации уже использован");
          }
          return { id: old.id, created: false };
        }
        const active = await client.query(
          `SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL
           AND blocked_at IS NULL AND paused_at IS NULL FOR SHARE`,
          [author],
        );
        if (!active.rows.length) throw forbidden("Публикация недоступна");
        const count = (await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM story_posts WHERE author_id=$1 AND created_at>now()-interval '24 hours'",
          [author],
        )).rows[0]?.count ?? 0;
        if (count >= 8) throw new HttpError(429, "Можно опубликовать до 8 историй за 24 часа");

        try { saved = await prepareStoryMedia(data); }
        catch (error) {
          if (error instanceof HttpError) throw error;
          throw badRequest("Не удалось обработать файл. Проверьте формат и длительность до 30 секунд");
        }
        const row = (await client.query<{ id: string }>(
          `INSERT INTO story_posts
            (author_id,client_temp_id,source_hash,kind,file_key,mime,file_size,duration_ms,caption)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [author, clientTempId, hash, saved.kind, saved.key, saved.mime,
            saved.size, saved.durationMs, caption],
        )).rows[0];
        if (!row) throw new Error("Story insert failed");

        await client.query(
          `INSERT INTO story_audience(story_id,user_id)
           SELECT $1,v.id FROM users v JOIN profiles vp ON vp.user_id=v.id
           WHERE v.id<>$2 AND v.deleted_at IS NULL AND v.blocked_at IS NULL
             AND v.paused_at IS NULL AND vp.is_seed=false
             AND ${contact("v.id", "$2")}
             AND NOT EXISTS (
               SELECT 1 FROM blocks b
               WHERE (b.user_id=v.id AND b.blocked_id=$2)
                  OR (b.user_id=$2 AND b.blocked_id=v.id)
             )`,
          [row.id, author],
        );
        return { id: row.id, created: true };
      });
    } catch (error) {
      if (saved) {
        try {
          const referenced = await queryOne(
            "SELECT id FROM story_posts WHERE file_key=$1", [saved.key],
          );
          if (!referenced) await removeStoryFile(saved.key);
        } catch {
          app.log.warn("Story upload cleanup deferred");
        }
      }
      throw error;
    } finally {
      uploading = false;
    }
  });

  app.post("/:id/view", async request => {
    const viewer = currentUserId(request);
    const { id } = idParams.parse(request.params);
    const rows = await query(
      `INSERT INTO story_views(story_id,user_id)
       SELECT s.id,$1 FROM story_posts s
       JOIN users u ON u.id=s.author_id JOIN profiles p ON p.user_id=s.author_id
       WHERE s.id=$2 AND ${access}
       ON CONFLICT(story_id,user_id) DO UPDATE SET viewed_at=story_views.viewed_at
       RETURNING story_id`,
      [viewer, id],
    );
    if (!rows.length) throw notFound("История недоступна");
    return { ok: true };
  });

  app.delete("/:id", async request => {
    const { id } = idParams.parse(request.params);
    const row = await queryOne(
      `UPDATE story_posts SET deleted_at=COALESCE(deleted_at,now())
       WHERE id=$1 AND author_id=$2 RETURNING id`,
      [id, currentUserId(request)],
    );
    if (!row) throw notFound("История не найдена");
    return { ok: true };
  });

  app.get("/:id/media", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const row = await queryOne<StoryRow>(
      `${selection} WHERE s.id=$2 AND ${access}`,
      [currentUserId(request), id],
    );
    if (!row) throw notFound("История недоступна");
    const file = storyPath(row.file_key);
    let size: number;
    try { size = (await stat(file)).size; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw notFound("Файл истории недоступен");
      throw error;
    }
    reply.header("Content-Type", row.mime);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", "inline");
    reply.header("Accept-Ranges", "bytes");

    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = 0, end = size - 1;
      let valid = !!match && !!(match[1] || match[2]);
      if (match && valid) {
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), size - 1);
        } else {
          const suffix = Number(match[2]);
          valid = suffix > 0;
          start = Math.max(0, size - suffix);
        }
      }
      if (!valid || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < 0 || start >= size || end < start) {
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      }
      return reply.code(206)
        .header("Content-Range", `bytes ${start}-${end}/${size}`)
        .header("Content-Length", end - start + 1)
        .send(createReadStream(file, { start, end }));
    }
    return reply.header("Content-Length", size).send(createReadStream(file));
  });

  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      const expired = await query<{ id: string; file_key: string }>(
        `SELECT id,file_key FROM story_posts
         WHERE (deleted_at IS NOT NULL AND created_at<now()-interval '24 hours') OR expires_at<now()
         ORDER BY expires_at LIMIT 100`,
      );
      for (const row of expired) {
        await removeStoryFile(row.file_key);
        await query("DELETE FROM story_posts WHERE id=$1", [row.id]);
      }
      let removed = 0;
      for (const key of await storyFiles()) {
        if (removed >= 100 || !/^[0-9a-f-]{36}\.(jpg|mp4)$/.test(key)) continue;
        const info = await stat(storyPath(key));
        if (Date.now() - info.mtimeMs < 48 * 3600000) continue;
        const linked = await queryOne("SELECT id FROM story_posts WHERE file_key=$1", [key]);
        if (!linked) { await removeStoryFile(key); removed++; }
      }
    } catch {
      app.log.warn("Story cleanup incomplete; will retry");
    } finally { cleaning = false; }
  };
  const timer = setInterval(() => { void cleanup(); }, 3600000);
  timer.unref();
  app.addHook("onClose", async () => { clearInterval(timer); });
}
