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
import { z } from "zod";

import { query, queryOne, transaction } from "../db.ts";
import { badRequest, forbidden, notFound } from "../http.ts";
import { assertSpaceMembership, currentUserId, requireAuth } from "../auth/middleware.ts";

const idParam = z.object({ id: z.string().uuid() });

const SPACE_SELECT = `
  SELECT s.id, s.title, s.description, s.topic, s.cover_url, s.category, s.format, s.cadence,
         s.city, s.verified_community, s.join_policy, s.join_question,
         hp.name AS host_name,
         (SELECT count(*) FROM space_members sm
           WHERE sm.space_id = s.id AND sm.status IN ('member', 'host'))::int AS members_count,
         COALESCE(mine.status::text, '') AS my_status,
         ARRAY(
           SELECT i.label FROM space_interests si
             JOIN interests i ON i.id = si.interest_id
            WHERE si.space_id = s.id
         ) AS interests
    FROM spaces s
    JOIN profiles hp ON hp.user_id = s.host_id
    LEFT JOIN space_members mine ON mine.space_id = s.id AND mine.user_id = $1
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
  host_name: string;
  members_count: number;
  my_status: string;
  interests: string[] | null;
}

async function loadEvents(spaceId: string, userId: string) {
  const rows = await query<{
    id: string;
    space_id: string;
    title: string;
    starts_at: Date;
    place: string;
    going_count: number;
    going: boolean;
  }>(
    `SELECT e.id, e.space_id, e.title, e.starts_at, e.place,
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
    // TODO: считать реальное расстояние (PostGIS или формула гаверсинуса
    // по s.lat/s.lon и координатам профиля).
    distanceKm: 0,
    membersCount: row.members_count,
    verifiedCommunity: row.verified_community,
    joinPolicy: row.join_policy,
    joinQuestion: row.join_question ?? undefined,
    interests: row.interests ?? [],
    isMember: row.my_status === "member" || row.my_status === "host",
    pendingRequest: row.my_status === "pending",
  };
}

async function loadSpaceDetail(spaceId: string, userId: string) {
  const row = await queryOne<SpaceRow>(`${SPACE_SELECT} WHERE s.id = $2`, [userId, spaceId]);
  if (!row) throw notFound("Сообщество не найдено");

  const members = await query<{ id: string; name: string; avatar_url: string | null; host: boolean }>(
    `SELECT u.id, p.name,
            (SELECT url FROM profile_media WHERE user_id = u.id AND kind = 'photo'
              ORDER BY is_primary DESC, position LIMIT 1) AS avatar_url,
            sm.status = 'host' AS host
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
    })),
    events,
    nextEvent: events[0],
  };
}

export async function spaceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const userId = currentUserId(request);
    const rows = await query<SpaceRow>(`${SPACE_SELECT} ORDER BY members_count DESC`, [userId]);
    const list = [];
    for (const row of rows) {
      const events = await loadEvents(row.id, userId);
      list.push({ ...toSpaceDto(row), nextEvent: events[0] });
    }
    return list;
  });

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
        coverUrl: z.string().url().max(500).optional(),
      })
      .parse(request.body);

    const space = await transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO spaces (title, description, category, format, cadence, city, cover_url, host_id)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, ''), $8) RETURNING id`,
        [
          draft.title,
          draft.description,
          draft.category,
          draft.format,
          draft.cadence,
          draft.city,
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
    return loadSpaceDetail(id, userId);
  });

  app.post<{ Params: { id: string } }>("/:id/join", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { answer } = z.object({ answer: z.string().max(500).optional() }).parse(request.body ?? {});

    const space = await queryOne<{ join_policy: "open" | "question" }>(
      "SELECT join_policy FROM spaces WHERE id = $1",
      [id],
    );
    if (!space) throw notFound("Сообщество не найдено");
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

    const isHost = await queryOne(
      "SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2 AND status = 'host'",
      [id, userId],
    );
    if (isHost) throw forbidden("Организатор не может выйти: сначала передайте сообщество");

    await query("DELETE FROM space_members WHERE space_id = $1 AND user_id = $2", [id, userId]);
    return loadSpaceDetail(id, userId);
  });

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
      created_at: Date;
    }>(
      `SELECT m.id, m.space_id, m.author_id, p.name AS author_name, m.text, m.created_at
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
}
