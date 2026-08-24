/**
 * POST   /api/media       — загрузка фото или видео профиля (multipart, поле `file`)
 * DELETE /api/media/:id   — удаление своего файла
 *
 * Тип файла определяется по содержимому, а не по имени; фото и видео
 * попадают в MEDIA_DIR/<userId>/ и раздаются Nginx по MEDIA_BASE_URL.
 */
import { unlink } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { badRequest, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import {
  MAX_VIDEO_BYTES,
  assertSize,
  detectMediaType,
  mediaPathFromUrl,
  saveProfileFile,
} from "../media/store.ts";

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const part = await request.file({ limits: { fileSize: MAX_VIDEO_BYTES } });
      if (!part) throw badRequest("Файл не получен");

      const buffer = await part.toBuffer();
      const type = detectMediaType(buffer);
      if (!type) throw badRequest("Поддерживаем фото JPEG/PNG/WebP и видео WebM/MP4");
      assertSize(type, buffer.length);

      const { url } = await saveProfileFile(userId, buffer, type);

      // Первое фото становится главным: с ним сверяется верификация.
      const existing = await queryOne<{ count: number }>(
        "SELECT count(*)::int AS count FROM profile_media WHERE user_id = $1 AND kind = $2",
        [userId, type.kind],
      );
      const isFirstPhoto = type.kind === "photo" && (existing?.count ?? 0) === 0;

      const row = await queryOne<{ id: string; created_at: Date }>(
        `INSERT INTO profile_media (user_id, kind, url, position, is_primary)
         VALUES ($1, $2, $3,
                 COALESCE((SELECT max(position) + 1 FROM profile_media WHERE user_id = $1), 0),
                 $4)
         RETURNING id, created_at`,
        [userId, type.kind, url, isFirstPhoto],
      );
      if (!row) throw badRequest("Не удалось сохранить файл");

      if (type.kind === "video") {
        await query("UPDATE profiles SET updated_at = now() WHERE user_id = $1", [userId]);
      }

      return { id: row.id, kind: type.kind, url, createdAt: row.created_at.toISOString() };
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const row = await queryOne<{ url: string }>(
      "DELETE FROM profile_media WHERE id = $1 AND user_id = $2 RETURNING url",
      [id, userId],
    );
    if (!row) throw notFound("Файл не найден");

    const filePath = mediaPathFromUrl(row.url);
    if (filePath) await unlink(filePath).catch(() => undefined);

    return reply.status(204).send();
  });
}
