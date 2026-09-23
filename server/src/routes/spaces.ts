/**
 * GET  /api/spaces                              — список сообществ
 * POST /api/spaces                              — создать сообщество
 * GET  /api/spaces/:id                          — SpaceDetail
 * POST /api/spaces/:id/join                     — { answer? }
 * POST /api/spaces/:id/leave
 * POST /api/spaces/:id/events/:eventId/rsvp     — { going }
 * GET  /api/spaces/:id/messages
 * POST /api/spaces/:id/messages                 — { text }
 *
 * Групповой чат читают и пишут только участники (assertSpaceMembership).
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { query, queryOne, transaction } from "../db.ts";
import { badRequest, forbidden, notFound } from "../http.ts";
import { assertSpaceMembership, currentUserId, requireAuth } from "../auth/middleware.ts";
import {
  audioDurationMs,
  detectAudioType,
  MAX_PHOTO_BYTES,
  MAX_VOICE_BYTES,
  assertSize,
  detectMediaType,
  saveProfileFile,
  saveVoiceFile,
  transcodeVoiceToAac,
} from "../media/store.ts";
import { sendPushToUsers } from "../push/send.ts";
import { publishUserEvent } from "../ws/notifications.ts";

const idParam = z.object({ id: z.string().uuid() });
const SEND_LIMIT = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

async function assertSpaceHost(userId: string, spaceId: string) {
  const row = await queryOne(
    `SELECT 1 FROM spaces s
      JOIN space_members sm ON sm.space_id = s.id
     WHERE s.id = $1 AND sm.user_id = $2 AND sm.status = 'host'`,
    [spaceId, userId],
  );
  if (!row) throw forbidden("Это действие доступно только создателю пространства");
}

/**
 * Обложка: либо относительный путь внутри нашего сайта (загруженный файл
 * /media/... или готовая картинка сборки /assets/...), либо https-ссылка.
 * Схемы вида javascript: и переходы «..» не пропускаем.
 */
const coverUrlSchema = z
  .string()
  .max(500)
  .refine(
    (value) =>
      (value.startsWith("/") && !value.startsWith("//") && !value.includes("..")) ||
      /^https:\/\/[^\s]+$/i.test(value),
    "Некорректная ссылка на обложку",
  );

const SPACE_SELECT = `
  SELECT s.id, s.title, s.description, s.topic, s.cover_url, s.category, s.format, s.cadence,
          s.city, s.verified_community, s.join_policy, s.join_question, s.is_seed, s.is_private,
         hp.name AS host_name,
         (SELECT count(*) FROM space_members sm
           WHERE sm.space_id = s.id AND sm.status IN ('member', 'host'))::int AS members_count,
         COALESCE(mine.status::text, '') AS my_status,
          COALESCE(invite.status, '') AS invite_status,
         ARRAY(
           SELECT i.label FROM space_interests si
             JOIN interests i ON i.id = si.interest_id
            WHERE si.space_id = s.id
         ) AS interests
    FROM spaces s
    JOIN profiles hp ON hp.user_id = s.host_id
    LEFT JOIN space_members mine ON mine.space_id = s.id AND mine.user_id = $1
    LEFT JOIN space_invites invite ON invite.space_id = s.id AND invite.invitee_id = $1
`;

interface SpaceRow {
  id: string;
  title: string;
  description: string;
  topic: string;
  cover_url: string;
  category: string;
  format: string;
  cadence: string;
  city: string;
  verified_community: boolean;
  join_policy: "open" | "question";
  join_question: string | null;
  is_seed: boolean;
  is_private: boolean;
  host_name: string;
  members_count: number;
  my_status: string;
  invite_status: string;
  interests: string[] | null;
}

async function loadEvents(spaceId: string, userId: string) {
  const rows = await query<{
    id: string;
    space_id: string;
    title: string;
    description: string;
    starts_at: Date;
    place: string;
    going_count: number;
    going: boolean;
  }>(
    `SELECT e.id, e.space_id, e.title, e.description, e.starts_at, e.place,
            (SELECT count(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.going)::int AS going_count,
            EXISTS (SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $2 AND r.going) AS going
       FROM space_events e
      WHERE e.space_id = $1 AND e.starts_at > now() - interval '1 day'
      ORDER BY e.starts_at`,
    [spaceId, userId],
  );
  return rows.map((row) => ({
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at.toISOString(),
    place: row.place,
    goingCount: row.going_count,
    going: row.going,
  }));
}

function toSpaceDto(row: SpaceRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    topic: row.topic,
    coverUrl: row.cover_url,
    category: row.category,
    format: row.format,
    cadence: row.cadence,
    city: row.city,
    // Демо-сообщество: интерфейс помечает такие карточки как пример.
    isSeed: row.is_seed,
    // TODO: считать реальное расстояние (PostGIS или формула гаверсинуса
    // по s.lat/s.lon и координатам профиля).
    distanceKm: 0,
    membersCount: row.members_count,
    verifiedCommunity: row.verified_community,
    joinPolicy: row.join_policy,
    joinQuestion: row.join_question ?? undefined,
    isPrivate: row.is_private,
    interests: row.interests ?? [],
    isMember: row.my_status === "member" || row.my_status === "host",
    // Организатор: только он создаёт структурированные встречи.
    isHost: row.my_status === "host",
    pendingRequest: row.my_status === "pending",
    invited: row.invite_status === "pending",
  };
}

async function loadSpaceDetail(spaceId: string, userId: string) {
  const row = await queryOne<SpaceRow>(`${SPACE_SELECT} WHERE s.id = $2`, [userId, spaceId]);
  if (!row) throw notFound("Сообщество не найдено");

  const members = await query<{
    id: string;
    name: string;
    avatar_url: string | null;
    host: boolean;
    online: boolean;
  }>(
    `SELECT u.id, p.name,
            (SELECT url FROM profile_media WHERE user_id = u.id AND kind = 'photo'
              ORDER BY is_primary DESC, position LIMIT 1) AS avatar_url,
            sm.status = 'host' AS host,
            u.last_seen_at > now() - interval '5 minutes' AS online
       FROM space_members sm
       JOIN users u    ON u.id = sm.user_id AND u.deleted_at IS NULL
       JOIN profiles p ON p.user_id = u.id
      WHERE sm.space_id = $1 AND sm.status IN ('member', 'host')
      ORDER BY host DESC, sm.joined_at
      LIMIT 60`,
    [spaceId],
  );

  const events = await loadEvents(spaceId, userId);

  return {
    ...toSpaceDto(row),
    hostName: row.host_name,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatar_url ?? undefined,
      host: m.host,
      online: m.online,
    })),
    events,
    nextEvent: events[0],
  };
}

export async function spaceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const userId = currentUserId(request);
    // Демо-сообщества показываем последними и скрываем, когда реальных
    // сообществ набралось достаточно.
    const rows = await query<SpaceRow>(
      `${SPACE_SELECT}
        WHERE (s.is_private = false OR mine.status IN ('member', 'host') OR invite.status = 'pending')
          AND (s.is_seed = false
           OR (SELECT count(*) FROM spaces rs WHERE rs.is_seed = false) < 10)
        ORDER BY s.is_seed ASC, members_count DESC`,
      [userId],
    );
    const list = [];
    for (const row of rows) {
      const events = await loadEvents(row.id, userId);
      list.push({ ...toSpaceDto(row), nextEvent: events[0] });
    }
    return list;
  });

  /**
   * POST /api/spaces/cover — загрузка своей обложки (multipart, поле `file`).
   * Файл кладём в общее медиа-хранилище, но в profile_media НЕ пишем:
   * это картинка сообщества, а не фото профиля.
   */
  app.post(
    "/cover",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const part = await request.file({ limits: { fileSize: MAX_PHOTO_BYTES } });
      if (!part) throw badRequest("Файл не получен");

      const buffer = await part.toBuffer();
      const type = detectMediaType(buffer);
      if (!type || type.kind !== "photo") throw badRequest("Обложка — это фото JPEG, PNG или WebP");
      assertSize(type, buffer.length);

      const { url } = await saveProfileFile(userId, buffer, type);
      return { url };
    },
  );


  app.post("/", async (request) => {
    const userId = currentUserId(request);
    const draft = z
      .object({
        title: z.string().min(3).max(120),
        description: z.string().max(2000).default(""),
        category: z.enum(["sport", "games", "professional", "culture", "food", "city"]),
        format: z.enum(["offline", "online", "mixed"]),
        cadence: z.enum(["weekly", "biweekly", "monthly", "occasional"]),
        city: z.string().max(120).default(""),
        isPrivate: z.boolean().default(false),
        coverUrl: coverUrlSchema.optional(),
      })
      .parse(request.body);

    const space = await transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO spaces (title, description, category, format, cadence, city, is_private, cover_url, host_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, ''), $9) RETURNING id`,
        [
          draft.title,
          draft.description,
          draft.category,
          draft.format,
          draft.cadence,
          draft.city,
          draft.isPrivate,
          draft.coverUrl ?? null,
          userId,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw badRequest("Не удалось создать сообщество");
      await client.query(
        "INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'host')",
        [id, userId],
      );
      return id;
    });

    return loadSpaceDetail(space, userId);
  });

  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const detail = await loadSpaceDetail(id, userId);
    if (detail.isPrivate && !detail.isMember && !detail.invited) {
      throw forbidden("Это закрытое пространство доступно только по приглашению");
    }
    return detail;
  });

  app.patch<{ Params: { id: string } }>("/:id/privacy", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { isPrivate } = z.object({ isPrivate: z.boolean() }).parse(request.body);
    await assertSpaceHost(userId, id);
    await query("UPDATE spaces SET is_private = $1 WHERE id = $2", [isPrivate, id]);
    return loadSpaceDetail(id, userId);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceHost(userId, id);
    const media = await query<{ media_url: string }>(
      "SELECT media_url FROM space_messages WHERE space_id = $1 AND media_url IS NOT NULL",
      [id],
    );
    await query("DELETE FROM spaces WHERE id = $1", [id]);
    for (const item of media) {
      const relative = item.media_url.replace(/^.*\/voice\//, "");
      if (relative !== item.media_url) await unlink(`${process.env.MEDIA_DIR ?? ""}/voice/${relative}`).catch(() => undefined);
    }
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>("/:id/invite-candidates", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { q } = z.object({ q: z.string().trim().max(80).default("") }).parse(request.query ?? {});
    await assertSpaceHost(userId, id);
    if (q.length < 2) return [];
    const rows = await query<{ id: string; name: string; avatar_url: string | null }>(
      `SELECT u.id, p.name,
              (SELECT url FROM profile_media pm WHERE pm.user_id = u.id AND pm.kind = 'photo'
                ORDER BY pm.is_primary DESC, pm.position LIMIT 1) AS avatar_url
         FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.id <> $1 AND u.deleted_at IS NULL AND p.is_seed = false
          AND p.name ILIKE $2
          AND NOT EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id = $3 AND sm.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM space_invites si WHERE si.space_id = $3 AND si.invitee_id = u.id AND si.status = 'pending')
        ORDER BY p.name LIMIT 12`,
      [userId, `%${q}%`, id],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, avatarUrl: row.avatar_url ?? undefined }));
  });

  app.post<{ Params: { id: string } }>("/:id/invites", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { userId: inviteeId } = z.object({ userId: z.string().uuid() }).parse(request.body);
    await assertSpaceHost(userId, id);
    const target = await queryOne(
      `SELECT 1 FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL AND p.is_seed = false`,
      [inviteeId],
    );
    if (!target) throw notFound("Пользователь не найден");
    const member = await queryOne("SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2", [id, inviteeId]);
    if (member) throw badRequest("Этот человек уже состоит в пространстве");
    await query(
      `INSERT INTO space_invites (space_id, inviter_id, invitee_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (space_id, invitee_id) DO UPDATE
         SET inviter_id = EXCLUDED.inviter_id, status = 'pending', created_at = now(), responded_at = NULL`,
      [id, userId, inviteeId],
    );
    return { invited: true };
  });

  app.post<{ Params: { id: string } }>("/:id/join", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { answer } = z.object({ answer: z.string().max(500).optional() }).parse(request.body ?? {});

    const space = await queryOne<{ join_policy: "open" | "question"; is_private: boolean }>(
      "SELECT join_policy, is_private FROM spaces WHERE id = $1",
      [id],
    );
    if (!space) throw notFound("Сообщество не найдено");
    if (space.is_private) {
      const invite = await queryOne(
        "SELECT 1 FROM space_invites WHERE space_id = $1 AND invitee_id = $2 AND status = 'pending'",
        [id, userId],
      );
      if (!invite) throw forbidden("В закрытое пространство можно войти только по приглашению");
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'member')
           ON CONFLICT (space_id, user_id) DO UPDATE SET status = 'member'`,
          [id, userId],
        );
        await client.query(
          "UPDATE space_invites SET status = 'accepted', responded_at = now() WHERE space_id = $1 AND invitee_id = $2",
          [id, userId],
        );
      });
      return loadSpaceDetail(id, userId);
    }
    if (space.join_policy === "question" && !answer?.trim()) {
      throw badRequest("Организатор ждёт короткий ответ на вопрос");
    }

    await query(
      `INSERT INTO space_members (space_id, user_id, status, join_answer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (space_id, user_id) DO UPDATE SET join_answer = EXCLUDED.join_answer`,
      [id, userId, space.join_policy === "open" ? "member" : "pending", answer ?? null],
    );

    return loadSpaceDetail(id, userId);
  });

  app.post<{ Params: { id: string } }>("/:id/leave", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);

    const isHost = await queryOne("SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2 AND status = 'host'", [id, userId]);
    if (isHost) throw forbidden("Организатор может только удалить пространство");

    await query("DELETE FROM space_members WHERE space_id = $1 AND user_id = $2", [id, userId]);
    return loadSpaceDetail(id, userId);
  });

  /**
   * POST /api/spaces/:id/events — организатор создаёт структурированную встречу.
   * Участники только отмечаются («Буду» / «Не смогу») через /rsvp.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/events",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const { id } = idParam.parse(request.params);
      const draft = z
        .object({
          title: z.string().min(3).max(160),
          startsAt: z.string().datetime({ offset: true }),
          place: z.string().max(200).default(""),
          description: z.string().max(2000).default(""),
        })
        .parse(request.body);

      const isHost = await queryOne(
        "SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2 AND status = 'host'",
        [id, userId],
      );
      if (!isHost) throw forbidden("Встречи создаёт только организатор сообщества");

      const createdEvent = await queryOne<{ id: string; created_at: Date }>(
        `INSERT INTO space_events (space_id, title, starts_at, place, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [id, draft.title, draft.startsAt, draft.place, draft.description, userId],
      );
      if (!createdEvent) throw new Error("space event insert failed");

      // Историю получают все реальные участники, а push — только те, кто
      // оставил включённым канал «Приглашения в Spaces».
      try {
        const members = await query<{ user_id: string; push_enabled: boolean }>(
          `SELECT m.user_id, COALESCE(np.spaces, true) AS push_enabled
             FROM space_members m
             JOIN profiles p ON p.user_id = m.user_id
             JOIN users u    ON u.id = m.user_id
             LEFT JOIN notification_prefs np ON np.user_id = m.user_id
            WHERE m.space_id = $1
              AND m.user_id <> $2
              AND m.status IN ('member', 'host')
              AND p.is_seed = false
               AND u.deleted_at IS NULL
            LIMIT 500`,
          [id, userId],
        );
        const space = await queryOne<{ title: string }>("SELECT title FROM spaces WHERE id = $1", [
          id,
        ]);
        const payload = {
          spaceId: id,
          eventId: createdEvent.id,
          spaceTitle: space?.title ?? "Пространство",
          title: draft.title,
          place: draft.place,
        };
        for (const member of members) {
          const notification = await queryOne<{ id: string; created_at: Date }>(
            `INSERT INTO notifications (user_id, kind, payload)
             VALUES ($1, 'space_event', $2::jsonb) RETURNING id, created_at`,
            [member.user_id, JSON.stringify(payload)],
          );
          if (notification) {
            publishUserEvent(member.user_id, {
              type: "notification",
              notification: {
                id: notification.id,
                kind: "space_event",
                payload,
                readAt: null,
                createdAt: notification.created_at.toISOString(),
              },
            });
          }
        }
        await sendPushToUsers(
          members.filter((member) => member.push_enabled).map((member) => member.user_id),
          {
            title: `Новая встреча${space?.title ? ` в «${space.title}»` : ""}`,
            body: draft.place ? `${draft.title} — ${draft.place}` : draft.title,
            url: `/spaces/${id}?eventId=${createdEvent.id}`,
            tag: `space-event-${createdEvent.id}`,
          },
        );
      } catch (error) {
        console.error("[spaces] пуш о новой встрече", error);
      }

      return loadSpaceDetail(id, userId);
    },
  );

  app.post<{ Params: { id: string; eventId: string } }>(
    "/:id/events/:eventId/rsvp",
    async (request) => {
      const userId = currentUserId(request);
      const params = z
        .object({ id: z.string().uuid(), eventId: z.string().uuid() })
        .parse(request.params);
      const { going } = z.object({ going: z.boolean() }).parse(request.body);
      await assertSpaceMembership(userId, params.id);

      const belongs = await queryOne("SELECT 1 FROM space_events WHERE id = $1 AND space_id = $2", [
        params.eventId,
        params.id,
      ]);
      if (!belongs) throw notFound("Событие не найдено");

      await query(
        `INSERT INTO event_rsvps (event_id, user_id, going) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id) DO UPDATE SET going = EXCLUDED.going`,
        [params.eventId, userId, going],
      );

      return loadSpaceDetail(params.id, userId);
    },
  );

  app.get<{ Params: { id: string } }>("/:id/messages", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);

    const rows = await query<{
      id: string;
      space_id: string;
      author_id: string;
      author_name: string;
      text: string;
      kind: "text" | "voice";
      client_temp_id: string | null;
      media_url: string | null;
      media_mime: string | null;
      duration_ms: number | null;
      created_at: Date;
    }>(
      `SELECT m.id, m.space_id, m.author_id, p.name AS author_name, m.text, m.kind,
              m.client_temp_id, m.media_url, m.media_mime, m.duration_ms, m.created_at
         FROM space_messages m
         JOIN profiles p ON p.user_id = m.author_id
        WHERE m.space_id = $1
        ORDER BY m.created_at
        LIMIT 300`,
      [id],
    );

    return rows.map((row) => ({
      id: row.id,
      spaceId: row.space_id,
      authorId: row.author_id,
      authorName: row.author_name,
      text: row.text,
      kind: row.kind,
      clientTempId: row.client_temp_id ?? undefined,
      mediaUrl: row.media_url ?? undefined,
      mediaMime: row.media_mime ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      createdAt: row.created_at.toISOString(),
    }));
  });

  app.post<{ Params: { id: string } }>("/:id/messages", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(request.body);
    await assertSpaceMembership(userId, id);

    const row = await queryOne<{ id: string; created_at: Date; author_name: string }>(
      `WITH inserted AS (
         INSERT INTO space_messages (space_id, author_id, text)
         VALUES ($1, $2, $3) RETURNING id, created_at, author_id
       )
       SELECT inserted.id, inserted.created_at, p.name AS author_name
         FROM inserted JOIN profiles p ON p.user_id = inserted.author_id`,
      [id, userId, text],
    );
    if (!row) throw notFound("Сообщество не найдено");

    return {
      id: row.id,
      spaceId: id,
      authorId: userId,
      authorName: row.author_name,
      text,
      createdAt: row.created_at.toISOString(),
    };
  });

  app.post<{ Params: { id: string } }>("/:id/voice", SEND_LIMIT, async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);
    const parts = request.parts({ limits: { fileSize: MAX_VOICE_BYTES, files: 1, fields: 3 } });
    let buffer: Buffer | null = null;
    let clientTempId = "";
    let durationValue = "";
    for await (const part of parts) {
      if (part.type === "file") buffer = await part.toBuffer();
      else if (part.fieldname === "clientTempId") clientTempId = String(part.value);
      else if (part.fieldname === "durationMs") durationValue = String(part.value);
    }
    if (!z.string().uuid().safeParse(clientTempId).success) throw badRequest("Некорректный идентификатор голосового");
    const durationMs = Number(durationValue);
    if (!Number.isInteger(durationMs) || durationMs < 400 || durationMs > 180_000) {
      throw badRequest("Голосовое может длиться от 0,4 секунды до 3 минут");
    }
    if (!buffer || buffer.length < 512) throw badRequest("Запись пустая");
    const audioType = detectAudioType(buffer);
    if (!audioType) throw badRequest("Поддерживаются голосовые WebM/Opus и MP4/AAC");
    const existing = await queryOne<{
      id: string; space_id: string; author_id: string; author_name: string; text: string;
      kind: "text" | "voice"; client_temp_id: string | null; media_url: string | null;
      media_mime: string | null; duration_ms: number | null; created_at: Date;
    }>(
      `SELECT m.id, m.space_id, m.author_id, p.name AS author_name, m.text, m.kind,
              m.client_temp_id, m.media_url, m.media_mime, m.duration_ms, m.created_at
         FROM space_messages m JOIN profiles p ON p.user_id = m.author_id
        WHERE m.space_id = $1 AND m.author_id = $2 AND m.client_temp_id = $3`,
      [id, userId, clientTempId],
    );
    if (existing) return {
      id: existing.id, spaceId: existing.space_id, authorId: existing.author_id,
      authorName: existing.author_name, text: existing.text, kind: existing.kind,
      clientTempId: existing.client_temp_id ?? undefined, mediaUrl: existing.media_url ?? undefined,
      mediaMime: existing.media_mime ?? undefined, durationMs: existing.duration_ms ?? undefined,
      createdAt: existing.created_at.toISOString(),
    };

    const saved = await saveVoiceFile(userId, buffer, audioType);
    let playable = saved;
    let playableMime: "audio/webm" | "audio/mp4" = audioType.mime;
    try {
      const measured = await audioDurationMs(saved.filePath).catch(() => 0);
      if (measured < 400) throw badRequest("Запись не содержит воспроизводимого звука");
      if (measured > 180_500) throw badRequest("Голосовое может длиться не больше 3 минут");
      const converted = await transcodeVoiceToAac(saved.filePath, userId).catch(() => null);
      if (converted) {
        playable = converted;
        playableMime = "audio/mp4";
        await unlink(saved.filePath).catch(() => undefined);
      }
      const row = await queryOne<{ id: string; created_at: Date; author_name: string }>(
        `WITH inserted AS (
           INSERT INTO space_messages
             (space_id, author_id, text, kind, client_temp_id, media_url, media_mime, duration_ms)
           VALUES ($1, $2, 'Голосовое сообщение', 'voice', $3, $4, $5, $6)
           RETURNING id, created_at, author_id
         )
         SELECT inserted.id, inserted.created_at, p.name AS author_name
           FROM inserted JOIN profiles p ON p.user_id = inserted.author_id`,
        [id, userId, clientTempId || randomUUID(), playable.url, playableMime, measured],
      );
      if (!row) throw badRequest("Не удалось сохранить голосовое");
      return {
        id: row.id, spaceId: id, authorId: userId, authorName: row.author_name,
        text: "Голосовое сообщение", kind: "voice" as const, clientTempId,
        mediaUrl: playable.url, mediaMime: playableMime, durationMs: measured,
        createdAt: row.created_at.toISOString(),
      };
    } catch (error) {
      await unlink(saved.filePath).catch(() => undefined);
      if (playable.filePath !== saved.filePath) await unlink(playable.filePath).catch(() => undefined);
      throw error;
    }
  });
}
