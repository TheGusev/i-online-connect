/**
 * In-app уведомления (сейчас — совпадения и отклики по объявлениям).
 *
 * GET  /api/notifications             — список ?unread=true&type=&limit=&cursor=
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

const filterKinds = {
  chats: ["new_message"],
  meetings: ["space_event"],
  matches: ["match"],
} as const;

function parseCursor(cursor?: string) {
  if (!cursor) return null;
  const separator = cursor.lastIndexOf("|");
  if (separator < 1) return null;
  const createdAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  const parsed = z
    .object({ createdAt: z.string().datetime(), id: z.string().uuid() })
    .safeParse({ createdAt, id });
  return parsed.success ? parsed.data : null;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const userId = currentUserId(request);
    const filters = z
      .object({
        unread: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        type: z.enum(["chats", "meetings", "matches"]).optional(),
        cursor: z.string().max(100).optional(),
      })
      .parse(request.query);

    const cursor = parseCursor(filters.cursor);
    const kinds = filters.type ? [...filterKinds[filters.type]] : null;
    const limit = filters.limit ?? 50;

    const rows = await query<NotificationRow>(
      `SELECT id, kind, payload, read_at, created_at
         FROM notifications
        WHERE user_id = $1
          AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
          AND ($3::text[] IS NULL OR kind = ANY($3::text[]))
          AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
        ORDER BY created_at DESC, id DESC
        LIMIT $6`,
      [
        userId,
        filters.unread ?? false,
        kinds,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const last = pageRows[pageRows.length - 1];
    const unreadRows = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notifications
        WHERE user_id = $1 AND read_at IS NULL
          AND ($2::text[] IS NULL OR kind = ANY($2::text[]))`,
      [userId, kinds],
    );
    return {
      unreadCount: unreadRows[0]?.count ?? 0,
      hasMore,
      nextCursor: hasMore && last ? `${last.created_at.toISOString()}|${last.id}` : null,
      items: pageRows.map((row) => ({
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
