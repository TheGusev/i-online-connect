/**
 * Подписки на push-уведомления.
 *
 * GET  /api/push/public-key   — публичный VAPID-ключ (фронтенд не пересобирают
 *                               при смене ключа, он берётся с сервера)
 * POST /api/push/subscribe    — сохранить подписку устройства
 * POST /api/push/unsubscribe  — удалить подписку устройства
 *
 * Приватный VAPID-ключ наружу не отдаётся никогда.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query } from "../db.ts";
import { env } from "../env.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(4).max(500),
  }),
});

export async function pushRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/public-key", async () => ({
    enabled: env.pushEnabled,
    publicKey: env.pushEnabled ? env.VAPID_PUBLIC_KEY : "",
  }));

  app.post(
    "/subscribe",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const subscription = subscriptionSchema.parse(request.body);
      const userAgent = String(request.headers["user-agent"] ?? "").slice(0, 300);

      await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
            SET user_id = EXCLUDED.user_id,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent,
                last_used_at = now()`,
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent],
      );

      return { ok: true as const };
    },
  );

  app.post(
    "/unsubscribe",
    { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const { endpoint } = z
        .object({ endpoint: z.string().url().max(2000) })
        .parse(request.body);

      await query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [
        userId,
        endpoint,
      ]);
      return { ok: true as const };
    },
  );
}
