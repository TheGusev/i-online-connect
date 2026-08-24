/**
 * GET  /api/trust/summary                  — уровень доверия и чеклист
 * POST /api/trust/reports                  — жалоба (+ опциональная блокировка)
 * GET  /api/trust/verification/challenge   — новое задание для видео-селфи
 * GET  /api/trust/verification/status      — статус последней заявки
 * POST /api/trust/verification             — живое видео (multipart) на сверку
 *
 * Видео-селфи — чувствительные данные: файл и кадры кладём в приватный
 * каталог (VERIFICATION_DIR), который Nginx не раздаёт, а в БД пишем только
 * путь и результат сверки.
 */
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { badRequest, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import {
  MAX_VIDEO_BYTES,
  detectMediaType,
  mediaPathFromUrl,
  savePrivateFile,
} from "../media/store.ts";
import { createChallenge, consumeChallenge } from "../verification/challenge.ts";
import { extractFrames } from "../verification/frames.ts";
import { matchFaces } from "../verification/face-match.ts";

const ETA_MINUTES = 2;
const MANUAL_ETA_HOURS = 24;

/** Ответ фронтенду по заявке. */
function ticket(row: {
  id: string;
  status: "none" | "pending" | "verified" | "rejected";
  submitted_at: Date;
  reason: string;
}) {
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at.toISOString(),
    reason: row.reason,
    etaMinutes: row.status === "pending" ? MANUAL_ETA_HOURS * 60 : ETA_MINUTES,
  };
}

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

  app.get("/verification/challenge", async (request) => {
    const userId = currentUserId(request);
    const photo = await queryOne<{ url: string }>(
      `SELECT url FROM profile_media
        WHERE user_id = $1 AND kind = 'photo'
        ORDER BY is_primary DESC, position LIMIT 1`,
      [userId],
    );
    if (!photo) {
      throw badRequest("Сначала добавьте фото в профиль — с ним мы будем сверять видео");
    }

    const challenge = await createChallenge(userId);
    return { ...challenge, referencePhotoUrl: photo.url };
  });

  app.get("/verification/status", async (request) => {
    const userId = currentUserId(request);
    const row = await queryOne<{
      id: string;
      status: "none" | "pending" | "verified" | "rejected";
      submitted_at: Date;
      reason: string;
    }>(
      `SELECT id, status, submitted_at, reason FROM verifications
        WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
      [userId],
    );
    if (!row) return { id: null, status: "none" as const, submittedAt: null, reason: "", etaMinutes: ETA_MINUTES };
    return ticket(row);
  });

  // Живое видео на сверку. Решение принимает автосверка; спорные случаи
  // остаются в статусе pending для ручного разбора.
  app.post(
    "/verification",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);

      const part = await request.file({ limits: { fileSize: MAX_VIDEO_BYTES } });
      if (!part) throw badRequest("Видео не получено");

      const challengeId = z
        .string()
        .uuid("Не передано задание")
        .parse((part.fields as Record<string, { value?: unknown } | undefined>)["challengeId"]?.value);

      const buffer = await part.toBuffer();
      const type = detectMediaType(buffer);
      if (!type || type.kind !== "video") {
        throw badRequest("Нужно видео в формате WebM или MP4");
      }

      const challenge = await consumeChallenge(userId, challengeId);

      const photo = await queryOne<{ url: string }>(
        `SELECT url FROM profile_media
          WHERE user_id = $1 AND kind = 'photo'
          ORDER BY is_primary DESC, position LIMIT 1`,
        [userId],
      );
      if (!photo) throw badRequest("В профиле нет фото — сверять не с чем");

      const videoPath = await savePrivateFile(userId, buffer, type.ext);
      const frames = await extractFrames(videoPath);
      const framePath =
        frames[0] ? await savePrivateFile(userId, frames[0], "jpg") : videoPath;

      // Фото профиля читаем с диска: наружу за ним не ходим.
      let reference: { buffer: Buffer; mime: string } | null = null;
      const photoPath = mediaPathFromUrl(photo.url);
      if (photoPath) {
        const file = await readFile(photoPath).catch(() => null);
        if (file) {
          reference = { buffer: file, mime: detectMediaType(file)?.mime ?? "image/jpeg" };
        }
      }

      const outcome = reference
        ? await matchFaces({
            frames,
            referencePhoto: reference,
            instructions: challenge.instructions,
            spokenCode: challenge.spokenCode,
          })
        : ({ decision: "manual", verdict: null, reason: "Фото профиля недоступно" } as const);

      const status =
        outcome.decision === "verified"
          ? "verified"
          : outcome.decision === "rejected"
            ? "rejected"
            : "pending";

      const reason =
        outcome.decision === "verified"
          ? "Лицо совпало с фото профиля"
          : "reason" in outcome
            ? outcome.reason
            : "";

      const row = await queryOne<{
        id: string;
        status: "none" | "pending" | "verified" | "rejected";
        submitted_at: Date;
        reason: string;
      }>(
        `INSERT INTO verifications
           (user_id, status, selfie_path, video_path, reference_url, challenge, verdict, confidence, reason,
            reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $2 = 'pending' THEN NULL ELSE now() END)
         RETURNING id, status, submitted_at, reason`,
        [
          userId,
          status,
          framePath,
          videoPath,
          photo.url,
          challenge.instructions.join("; "),
          outcome.verdict ? JSON.stringify(outcome.verdict) : null,
          outcome.verdict?.confidence ?? null,
          reason,
        ],
      );
      if (!row) throw badRequest("Не удалось отправить заявку");

      if (status === "verified") {
        // Видео-подтверждение и уровень доверия обновляем только по факту сверки.
        await query(
          `UPDATE profiles
              SET video_verified = true,
                  trust_level = CASE WHEN trust_level = 'new' THEN 'verified' ELSE trust_level END,
                  trust_score = LEAST(100, trust_score + 20),
                  updated_at = now()
            WHERE user_id = $1`,
          [userId],
        );
      }

      return ticket(row);
    },
  );
}
