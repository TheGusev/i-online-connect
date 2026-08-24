/**
 * GET   /api/profiles/me            — свой профиль (MyProfile)
 * PATCH /api/profiles/me            — правка своего профиля
 * GET   /api/profiles/:id           — краткий профиль (User)
 * GET   /api/profiles/:id/detail    — публичный профиль (ProfileDetail)
 *
 * Правило приватности: чужой профиль отдаём без точных координат и без
 * приватной статистики. Заблокированные друг другом люди профиль не видят.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne, transaction } from "../db.ts";
import { forbidden, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { toUserDto, type ProfileRow } from "../types.ts";

const BASE_SELECT = `
  SELECT u.id, p.name, p.age, p.city, p.bio, p.trust_level, p.trust_score, u.last_seen_at,
         p.intent, p.intent_note, p.video_verified, p.safe_meetings, p.clean_conversations,
         p.created_at AS joined_at,
         ARRAY(
           SELECT i.label FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
            WHERE ui.user_id = u.id
         ) AS interests,
         ARRAY(SELECT value FROM profile_values WHERE user_id = u.id) AS values
    FROM users u
    JOIN profiles p ON p.user_id = u.id
   WHERE u.id = $1 AND u.deleted_at IS NULL
`;

type DetailRow = ProfileRow & {
  intent: "serious" | "friends" | "projects" | "unsure";
  intent_note: string;
  video_verified: boolean;
  safe_meetings: number;
  clean_conversations: number;
  joined_at: Date;
  values: string[] | null;
};

async function loadMedia(userId: string) {
  const rows = await query<{ id: string; kind: "photo" | "video"; url: string }>(
    "SELECT id, kind, url FROM profile_media WHERE user_id = $1 ORDER BY position, created_at",
    [userId],
  );
  return rows.map((row) => ({ id: row.id, kind: row.kind, url: row.url }));
}

const monthsSince = (date: Date) =>
  Math.max(0, Math.floor((Date.now() - date.getTime()) / (30 * 24 * 60 * 60 * 1000)));

/** Сборка MyProfile: используется и в GET, и в ответе на PATCH. */
async function loadMyProfile(userId: string) {
  {
    const row = await queryOne<DetailRow>(BASE_SELECT, [userId]);
    if (!row) throw notFound("Профиль не найден");

    const privacy = await queryOne<{
      exact_location: "nobody" | "matches" | "everyone";
      visible_in_feed: boolean;
      who_can_message: "everyone" | "verified" | "matches";
    }>("SELECT exact_location, visible_in_feed, who_can_message FROM privacy_settings WHERE user_id = $1", [userId]);

    const verification = await queryOne<{ status: "none" | "pending" | "verified" | "rejected" }>(
      "SELECT status FROM verifications WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1",
      [userId],
    );

    return {
      ...toUserDto(row),
      media: await loadMedia(userId),
      intent: row.intent === "unsure" ? "friends" : row.intent,
      intentNote: row.intent_note,
      values: row.values ?? [],
      trust: {
        videoVerified: row.video_verified,
        monthsOnPlatform: monthsSince(row.joined_at),
        safeMeetings: row.safe_meetings,
      },
      privacy: {
        exactLocation: privacy?.exact_location ?? "matches",
        visibleInFeed: privacy?.visible_in_feed ?? true,
        whoCanMessage: privacy?.who_can_message ?? "verified",
      },
      verification:
        verification?.status === "verified"
          ? "verified"
          : verification?.status === "pending"
            ? "pending"
            : "none",
      stats: {
        cleanConversations: row.clean_conversations,
        safeMeetings: row.safe_meetings,
        joinedAt: row.joined_at.toISOString(),
      },
    };
  }
}

export async function profileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/me", async (request) => loadMyProfile(currentUserId(request)));

  const patchSchema = z.object({
    name: z.string().min(2).max(80).optional(),
    bio: z.string().max(1000).optional(),
    city: z.string().max(120).optional(),
    intentNote: z.string().max(300).optional(),
    interests: z.array(z.string().min(1).max(60)).max(20).optional(),
    values: z.array(z.string().min(1).max(60)).max(10).optional(),
    privacy: z
      .object({
        exactLocation: z.enum(["nobody", "matches", "everyone"]).optional(),
        visibleInFeed: z.boolean().optional(),
        whoCanMessage: z.enum(["everyone", "verified", "matches"]).optional(),
      })
      .optional(),
  });

  app.patch("/me", async (request) => {
    const userId = currentUserId(request);
    const patch = patchSchema.parse(request.body);

    // Обновляем только переданные поля: COALESCE оставляет прежнее значение.
    await query(
      `UPDATE profiles SET
         name        = COALESCE($2, name),
         bio         = COALESCE($3, bio),
         city        = COALESCE($4, city),
         intent_note = COALESCE($5, intent_note),
         updated_at  = now()
       WHERE user_id = $1`,
      [userId, patch.name ?? null, patch.bio ?? null, patch.city ?? null, patch.intentNote ?? null],
    );

    if (patch.privacy) {
      await query(
        `UPDATE privacy_settings SET
           exact_location  = COALESCE($2, exact_location),
           visible_in_feed = COALESCE($3, visible_in_feed),
           who_can_message = COALESCE($4, who_can_message),
           updated_at      = now()
         WHERE user_id = $1`,
        [
          userId,
          patch.privacy.exactLocation ?? null,
          patch.privacy.visibleInFeed ?? null,
          patch.privacy.whoCanMessage ?? null,
        ],
      );
    }

    // Интересы и ценности пересобираем целиком: пришёл массив — он и есть
    // актуальный набор. Недостающие метки добавляем в общий справочник.
    if (patch.interests) {
      await transaction(async (client) => {
        await client.query("DELETE FROM user_interests WHERE user_id = $1", [userId]);
        for (const label of patch.interests ?? []) {
          const slug = label.trim().toLowerCase().replace(/\s+/g, "-");
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO interests (slug, label) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label
             RETURNING id`,
            [slug, label.trim()],
          );
          const interestId = rows[0]?.id;
          if (interestId) {
            await client.query(
              `INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [userId, interestId],
            );
          }
        }
      });
    }

    if (patch.values) {
      await transaction(async (client) => {
        await client.query("DELETE FROM profile_values WHERE user_id = $1", [userId]);
        for (const value of patch.values ?? []) {
          await client.query(
            "INSERT INTO profile_values (user_id, value) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [userId, value.trim().slice(0, 60)],
          );
        }
      });
    }

    return loadMyProfile(userId);
  });

  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const viewerId = currentUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await assertNotBlocked(viewerId, id);

    const row = await queryOne<ProfileRow>(BASE_SELECT, [id]);
    if (!row) throw notFound("Профиль не найден");
    return toUserDto(row);
  });

  app.get<{ Params: { id: string } }>("/:id/detail", async (request) => {
    const viewerId = currentUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await assertNotBlocked(viewerId, id);

    const row = await queryOne<DetailRow>(BASE_SELECT, [id]);
    if (!row) throw notFound("Профиль не найден");

    return {
      ...toUserDto(row),
      media: await loadMedia(id),
      intent: row.intent === "unsure" ? "friends" : row.intent,
      intentNote: row.intent_note,
      values: row.values ?? [],
      trust: {
        videoVerified: row.video_verified,
        monthsOnPlatform: monthsSince(row.joined_at),
        safeMeetings: row.safe_meetings,
      },
    };
  });
}

/** Блокировка работает в обе стороны: ни один из двоих не видит другого. */
async function assertNotBlocked(viewerId: string, targetId: string) {
  if (viewerId === targetId) return;
  const blocked = await queryOne(
    `SELECT 1 FROM blocks
      WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`,
    [viewerId, targetId],
  );
  if (blocked) throw forbidden("Профиль недоступен");
}
