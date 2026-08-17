/**
 * GET  /api/trust/summary       — уровень доверия и чеклист
 * POST /api/trust/reports       — жалоба (+ опциональная блокировка)
 * POST /api/trust/verification  — live-селфи на сверку с фото профиля
 *
 * Селфи — чувствительные данные: файл кладём в приватный каталог
 * (VERIFICATION_DIR), который Nginx не раздаёт, а в БД пишем только путь.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { badRequest, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";

export async function trustRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/summary", async (request) => {
    const userId = currentUserId(request);
    const row = await queryOne<{
      trust_level: "new" | "verified" | "trusted" | "ambassador";
      trust_score: number;
      video_verified: boolean;
      onboarded_at: Date | null;
      photos: number;
      email_verified: boolean;
      safe_meetings: number;
    }>(
      `SELECT p.trust_level, p.trust_score, p.video_verified, p.onboarded_at, p.safe_meetings,
              u.email_verified,
              (SELECT count(*) FROM profile_media WHERE user_id = u.id AND kind = 'photo')::int AS photos
         FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE p.user_id = $1`,
      [userId],
    );
    if (!row) throw notFound("Профиль не найден");

    return {
      level: row.trust_level,
      score: row.trust_score,
      checks: [
        { id: "email", label: "Email подтверждён", done: row.email_verified },
        { id: "profile", label: "Профиль заполнен", done: Boolean(row.onboarded_at) },
        { id: "photo", label: "Есть фото", done: row.photos > 0 },
        { id: "video", label: "Видео-подтверждение", done: row.video_verified },
        { id: "meetings", label: "Есть безопасные встречи", done: row.safe_meetings > 0 },
      ],
    };
  });

  app.post("/reports", async (request) => {
    const userId = currentUserId(request);
    const draft = z
      .object({
        category: z.enum(["fake", "behavior", "scam", "other"]),
        details: z.string().max(2000).default(""),
        subjectId: z.string().uuid(),
        source: z.enum(["chat", "profile"]),
        blockToo: z.boolean().optional(),
      })
      .parse(request.body);

    if (draft.subjectId === userId) throw badRequest("Нельзя пожаловаться на себя");

    const row = await queryOne<{ id: string; created_at: Date; review_hours: number }>(
      `INSERT INTO reports (reporter_id, subject_id, category, source, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at, review_hours`,
      [userId, draft.subjectId, draft.category, draft.source, draft.details],
    );
    if (!row) throw badRequest("Не удалось отправить жалобу");

    if (draft.blockToo) {
      await query(
        "INSERT INTO blocks (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, draft.subjectId],
      );
    }

    return {
      id: row.id,
      createdAt: row.created_at.toISOString(),
      reviewHours: row.review_hours,
    };
  });

  app.post(
    "/verification",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const draft = z
        .object({
          // data URL из getUserMedia; ограничиваем размер (~2 МБ base64).
          selfie: z.string().max(3_000_000).regex(/^data:image\/(png|jpe?g);base64,/),
          referencePhotoUrl: z.string().max(1000),
        })
        .parse(request.body);

      const base64 = draft.selfie.slice(draft.selfie.indexOf(",") + 1);
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > 5 * 1024 * 1024) throw badRequest("Файл слишком большой");

      const dir = path.join(env.VERIFICATION_DIR, userId);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, `${randomUUID()}.jpg`);
      await writeFile(filePath, buffer, { mode: 0o600 });

      const row = await queryOne<{ id: string; submitted_at: Date }>(
        `INSERT INTO verifications (user_id, status, selfie_path, reference_url)
         VALUES ($1, 'pending', $2, $3) RETURNING id, submitted_at`,
        [userId, filePath, draft.referencePhotoUrl],
      );
      if (!row) throw badRequest("Не удалось отправить заявку");

      // TODO: очередь ручной модерации или внешний сервис сверки лиц.
      // Решение модератора обновляет verifications.status и profiles.video_verified.
      return {
        id: row.id,
        status: "pending" as const,
        submittedAt: row.submitted_at.toISOString(),
        etaMinutes: 30,
      };
    },
  );
}
