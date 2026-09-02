/**
 * In-app уведомления (сейчас — совпадения и отклики по объявлениям).
 *
 * GET  /api/notifications             — список ?unread=true&limit=
 * POST /api/notifications/read        — { ids?: string[] } — без ids читает все
 *
 * Реальное время идёт через ws/notifications.ts; таблица — «догоняющая»
 * доставка для тех, кто был офлайн.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query } from "../db.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";

interface NotificationRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const userId = currentUserId(request);
    const filters = z
      .object({
        unread: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(request.query);

    const rows = await query<NotificationRow>(
      `SELECT id, kind, payload, read_at, created_at
         FROM notifications
        WHERE user_id = $1
          AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
        ORDER BY created_at DESC
        LIMIT $3`,
      [userId, filters.unread ?? false, filters.limit ?? 50],
    );

    const unread = rows.filter((row) => !row.read_at).length;
    return {
      unreadCount: unread,
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        readAt: row.read_at ? row.read_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });

  app.post("/read", async (request) => {
    const userId = currentUserId(request);
    const body = z
      .object({ ids: z.array(z.string().uuid()).max(200).optional() })
      .parse(request.body ?? {});

    await query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL
          AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [userId, body.ids ?? null],
    );
    return { ok: true as const };
  });
}
