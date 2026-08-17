/**
 * GET  /api/matching/daily                    — дневная подборка (DailyFeed)
 * GET  /api/matching/candidates               — кандидаты (совместимо со старым экраном)
 * POST /api/matching/candidates/:id/reaction  — like / skip / save
 *
 * Смысл продукта: не бесконечная лента, а 5 совпадений в сутки.
 * Подборка фиксируется на дату: повторный запрос за тот же день отдаёт то же
 * самое, чтобы человек не «прокручивал» новых людей обновлением страницы.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne, transaction } from "../db.ts";
import { env } from "../env.ts";
import { badRequest } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { toUserDto, type ProfileRow } from "../types.ts";

/** Начало следующих суток в UTC — время обновления подборки. */
function nextRefreshAt(): string {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

const FEED_SELECT = `
  SELECT u.id, p.name, p.age, p.city, p.bio, p.trust_level, p.trust_score, u.last_seen_at,
         d.compatibility, d.reasons, d.ai_explanation, d.first_message_hint,
         COALESCE(
           (SELECT url FROM profile_media WHERE user_id = u.id AND kind = 'photo'
             ORDER BY is_primary DESC, position LIMIT 1), ''
         ) AS photo_url,
         EXISTS (SELECT 1 FROM profile_media WHERE user_id = u.id AND kind = 'video') AS has_video,
         ARRAY(
           SELECT i.label FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
            WHERE ui.user_id = u.id
         ) AS interests,
         ARRAY(
           SELECT i.label FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
            WHERE ui.user_id = u.id
              AND ui.interest_id IN (SELECT interest_id FROM user_interests WHERE user_id = $1)
         ) AS shared_interests
    FROM daily_feed d
    JOIN users u    ON u.id = d.candidate_id AND u.deleted_at IS NULL
    JOIN profiles p ON p.user_id = u.id
   WHERE d.user_id = $1 AND d.feed_date = CURRENT_DATE
   ORDER BY d.position
`;

type FeedRow = ProfileRow & {
  compatibility: number;
  reasons: string[] | null;
  ai_explanation: string;
  first_message_hint: string;
  photo_url: string;
  has_video: boolean;
  shared_interests: string[] | null;
};

/**
 * Формирование подборки на сегодня.
 *
 * TODO (бизнес-логика подбора): сейчас это базовый отбор —
 * город, 18+, видимость в подборках, отсутствие блокировок и прошлых реакций,
 * ранжирование по числу общих интересов и уровню доверия.
 * Здесь же место для вашего алгоритма (веса намерений, активность, гео-радиус)
 * и для генерации ai_explanation / first_message_hint внешним AI-сервисом.
 */
async function buildDailyFeed(userId: string): Promise<void> {
  await transaction(async (client) => {
    const { rows: existing } = await client.query(
      "SELECT 1 FROM daily_feed WHERE user_id = $1 AND feed_date = CURRENT_DATE LIMIT 1",
      [userId],
    );
    if (existing.length > 0) return;

    await client.query(
      `INSERT INTO daily_feed (user_id, candidate_id, feed_date, compatibility, reasons, position)
       SELECT $1,
              c.id,
              CURRENT_DATE,
              LEAST(100, 40 + c.shared * 12 + c.trust_score / 5)::smallint,
              ARRAY[]::text[],
              (ROW_NUMBER() OVER (ORDER BY c.shared DESC, c.trust_score DESC) - 1)::smallint
         FROM (
           SELECT u.id,
                  p.trust_score,
                  (SELECT count(*) FROM user_interests ui
                    WHERE ui.user_id = u.id
                      AND ui.interest_id IN (SELECT interest_id FROM user_interests WHERE user_id = $1)
                  ) AS shared
             FROM users u
             JOIN profiles p  ON p.user_id = u.id
             JOIN privacy_settings s ON s.user_id = u.id
            WHERE u.id <> $1
              AND u.deleted_at IS NULL
              AND u.paused_at IS NULL
              AND s.visible_in_feed
              AND p.onboarded_at IS NOT NULL
              AND p.age >= 18
              AND NOT EXISTS (SELECT 1 FROM match_reactions r WHERE r.user_id = $1 AND r.target_id = u.id)
              AND NOT EXISTS (
                    SELECT 1 FROM blocks b
                     WHERE (b.user_id = $1 AND b.blocked_id = u.id)
                        OR (b.user_id = u.id AND b.blocked_id = $1)
                  )
            ORDER BY shared DESC, p.trust_score DESC
            LIMIT $2
         ) c
       ON CONFLICT DO NOTHING`,
      [userId, env.DAILY_MATCH_LIMIT],
    );
  });
}

export async function matchingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/daily", async (request) => {
    const userId = currentUserId(request);
    await buildDailyFeed(userId);

    const rows = await query<FeedRow>(FEED_SELECT, [userId]);
    return {
      matches: rows.map((row) => ({
        ...toUserDto(row),
        compatibility: row.compatibility,
        reasons: row.reasons ?? [],
        quote: "",
        photoUrl: row.photo_url,
        hasVideo: row.has_video,
        sharedInterests: row.shared_interests ?? [],
        aiExplanation: row.ai_explanation,
        firstMessageHint: row.first_message_hint,
      })),
      dailyLimit: env.DAILY_MATCH_LIMIT,
      nextRefreshAt: nextRefreshAt(),
    };
  });

  app.get("/candidates", async (request) => {
    const userId = currentUserId(request);
    await buildDailyFeed(userId);
    const rows = await query<FeedRow>(FEED_SELECT, [userId]);
    return rows.map((row) => ({
      ...toUserDto(row),
      compatibility: row.compatibility,
      reasons: row.reasons ?? [],
    }));
  });

  app.post<{ Params: { id: string } }>("/candidates/:id/reaction", async (request) => {
    const userId = currentUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { reaction } = z
      .object({ reaction: z.enum(["like", "skip", "save"]) })
      .parse(request.body);

    if (id === userId) throw badRequest("Нельзя реагировать на свой профиль");

    await query(
      `INSERT INTO match_reactions (user_id, target_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, target_id) DO UPDATE SET reaction = EXCLUDED.reaction`,
      [userId, id, reaction],
    );

    if (reaction !== "like") return { matched: false };

    // Взаимный лайк -> пара и диалог. Порядок в паре нормализован (user_a < user_b).
    const mutual = await queryOne(
      "SELECT 1 FROM match_reactions WHERE user_id = $1 AND target_id = $2 AND reaction = 'like'",
      [id, userId],
    );
    if (!mutual) return { matched: false };

    await transaction(async (client) => {
      const [a, b] = userId < id ? [userId, id] : [id, userId];
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO matches (user_a, user_b) VALUES ($1, $2)
         ON CONFLICT (user_a, user_b) DO UPDATE SET created_at = matches.created_at
         RETURNING id`,
        [a, b],
      );
      const matchId = rows[0]?.id;
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO conversations (match_id) VALUES ($1) RETURNING id`,
        [matchId ?? null],
      );
      const conversationId = conversation.rows[0]?.id;
      if (!conversationId) return;
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
        [conversationId, a, b],
      );
    });

    return { matched: true };
  });
}
