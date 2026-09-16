/**
 * GET /api/presence/summary — сколько пользователей сейчас онлайн.
 *
 * Отдельного механизма присутствия не вводим: источник правды — уже
 * существующее поле users.last_seen_at (то же окно, что у статуса «в сети»
 * в шапке диалога). Заодно обновляем last_seen_at вызывающего: поллинг
 * раз в ~45 секунд держит его в онлайне без отдельного heartbeat.
 */
import type { FastifyInstance } from "fastify";

import { query, queryOne } from "../db.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";

const ONLINE_WINDOW_MINUTES = 5;

export async function presenceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/summary", async (request) => {
    const userId = currentUserId(request);

    await query("UPDATE users SET last_seen_at = now() WHERE id = $1", [userId]);

    const row = await queryOne<{ city: number; total: number; city_name: string | null }>(
      `WITH me AS (SELECT city FROM profiles WHERE user_id = $1)
       SELECT
         count(*) FILTER (
           WHERE p.city <> '' AND p.city = (SELECT city FROM me)
         )::int AS city,
         count(*)::int AS total,
         (SELECT NULLIF(city, '') FROM me) AS city_name
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.last_seen_at > now() - make_interval(mins => $2)
         AND u.blocked_at IS NULL
         AND u.deleted_at IS NULL
         AND u.paused_at IS NULL`,
      [userId, ONLINE_WINDOW_MINUTES],
    );

    return {
      city: row?.city ?? 0,
      cityName: row?.city_name ?? null,
      total: row?.total ?? 0,
    };
  });
}
