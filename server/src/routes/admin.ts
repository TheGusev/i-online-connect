/**
 * /api/admin/* — модерация и управление платформой.
 *
 * Плагин целиком закрыт requireAdmin (onRequest), поверх — свой, более
 * строгий rate limit и отдельный аудит-лог доступа.
 *
 * DTO-правило: наружу не уходят password_hash, token_hash, пути к селфи и
 * видео верификации, коды подтверждения. Даже администратору.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { currentAdminId, logAdminAction, registerAdminAuditLog, requireAdmin } from "../auth/admin.ts";
import { revokeAllForUser } from "../auth/tokens.ts";
import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { badRequest, notFound } from "../http.ts";
import { sendMail } from "../mail/smtp.ts";

const uuid = z.string().uuid("Некорректный идентификатор");
const idParams = z.object({ id: uuid });

const pageQuery = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Ответ списка: одинаковая форма для всех разделов админки. */
function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, limit, hasMore: page * limit < total };
}

// Лимиты на изменяющие действия: админка не должна быть инструментом
// массовых операций даже при угнанном токене администратора.
const writeLimit = { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } };
const destructiveLimit = { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } };

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAdmin);
  registerAdminAuditLog(app);

  // ── Пользователи ──────────────────────────────────────────────────────────

  app.get("/users", async (request) => {
    const filters = pageQuery
      .extend({
        verified: z.enum(["yes", "no"]).optional(),
        blocked: z.enum(["yes", "no"]).optional(),
      })
      .parse(request.query);
    const { q, page, limit } = filters;

    const where: string[] = ["u.deleted_at IS NULL"];
    const params: (string | number)[] = [];

    if (q) {
      params.push(`%${q}%`);
      where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
    }
    if (filters.verified) {
      where.push(
        filters.verified === "yes"
          ? "p.video_verified"
          : "COALESCE(p.video_verified, false) = false",
      );
    }
    if (filters.blocked) {
      where.push(filters.blocked === "yes" ? "u.blocked_at IS NOT NULL" : "u.blocked_at IS NULL");
    }


    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = await queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id ${whereSql}`,
      params,
    );

    params.push(limit, (page - 1) * limit);
    const rows = await query(
      `SELECT u.id, u.email::text AS email, u.role, u.email_verified, u.phone_verified,
              u.blocked_at, u.blocked_reason, u.paused_at, u.last_seen_at, u.created_at,
              p.name, p.city, p.trust_level, p.trust_score, p.video_verified
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return paged(
      rows.map((row) => ({
        id: row.id as string,
        email: row.email as string,
        role: row.role as string,
        name: (row.name as string | null) ?? "",
        city: (row.city as string | null) ?? "",
        trustLevel: (row.trust_level as string | null) ?? "new",
        trustScore: (row.trust_score as number | null) ?? 0,
        videoVerified: Boolean(row.video_verified),
        emailVerified: Boolean(row.email_verified),
        phoneVerified: Boolean(row.phone_verified),
        blockedAt: row.blocked_at as Date | null,
        blockedReason: (row.blocked_reason as string | null) ?? "",
        pausedAt: row.paused_at as Date | null,
        lastSeenAt: row.last_seen_at as Date | null,
        createdAt: row.created_at as Date,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });

  app.get("/users/:id", async (request) => {
    const { id } = idParams.parse(request.params);

    const user = await queryOne(
      `SELECT u.id, u.email::text AS email, u.phone, u.role, u.language,
              u.email_verified, u.phone_verified, u.blocked_at, u.blocked_reason,
              u.paused_at, u.deleted_at, u.last_seen_at, u.created_at,
              p.name, p.age, p.city, p.bio, p.intent, p.trust_level, p.trust_score,
              p.video_verified, p.safe_meetings, p.clean_conversations, p.onboarded_at
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [id],
    );
    if (!user) throw notFound("Пользователь не найден");

    const [media, verification, attempts, reports, sessions] = await Promise.all([
      query(
        `SELECT id, kind, url, position, is_primary, created_at
           FROM profile_media WHERE user_id = $1 ORDER BY position`,
        [id],
      ),
      // Пути к файлам селфи/видео не отдаём: наружу только вердикт.
      queryOne(
        `SELECT id, status, confidence, reason, manual, submitted_at, reviewed_at
           FROM verifications WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [id],
      ),
      query(
        `SELECT success, ip::text AS ip, created_at FROM login_attempts
           WHERE email = (SELECT email FROM users WHERE id = $1)
          ORDER BY created_at DESC LIMIT 20`,
        [id],
      ),
      queryOne<{ against: string; by: string }>(
        `SELECT
            (SELECT count(*)::text FROM reports WHERE subject_id = $1)  AS against,
            (SELECT count(*)::text FROM reports WHERE reporter_id = $1) AS by`,
        [id],
      ),
      queryOne<{ count: string }>(
        `SELECT count(*)::text AS count FROM refresh_tokens
          WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
        [id],
      ),
    ]);

    return {
      id: user.id as string,
      email: user.email as string,
      phone: (user.phone as string | null) ?? "",
      role: user.role as string,
      language: user.language as string,
      emailVerified: Boolean(user.email_verified),
      phoneVerified: Boolean(user.phone_verified),
      blockedAt: user.blocked_at as Date | null,
      blockedReason: (user.blocked_reason as string | null) ?? "",
      pausedAt: user.paused_at as Date | null,
      deletedAt: user.deleted_at as Date | null,
      lastSeenAt: user.last_seen_at as Date | null,
      createdAt: user.created_at as Date,
      profile: {
        name: (user.name as string | null) ?? "",
        age: (user.age as number | null) ?? null,
        city: (user.city as string | null) ?? "",
        bio: (user.bio as string | null) ?? "",
        intent: (user.intent as string | null) ?? "unsure",
        trustLevel: (user.trust_level as string | null) ?? "new",
        trustScore: (user.trust_score as number | null) ?? 0,
        videoVerified: Boolean(user.video_verified),
        safeMeetings: (user.safe_meetings as number | null) ?? 0,
        cleanConversations: (user.clean_conversations as number | null) ?? 0,
        onboardedAt: (user.onboarded_at as Date | null) ?? null,
      },
      media: media.map((row) => ({
        id: row.id as string,
        kind: row.kind as string,
        url: row.url as string,
        position: row.position as number,
        isPrimary: Boolean(row.is_primary),
      })),
      verification: verification
        ? {
            id: verification.id as string,
            status: verification.status as string,
            confidence: (verification.confidence as number | null) ?? null,
            reason: (verification.reason as string | null) ?? "",
            manual: Boolean(verification.manual),
            submittedAt: verification.submitted_at as Date,
            reviewedAt: (verification.reviewed_at as Date | null) ?? null,
          }
        : null,
      loginAttempts: attempts.map((row) => ({
        success: Boolean(row.success),
        ip: (row.ip as string | null) ?? "",
        createdAt: row.created_at as Date,
      })),
      reportsAgainst: Number(reports?.against ?? 0),
      reportsBy: Number(reports?.by ?? 0),
      activeSessions: Number(sessions?.count ?? 0),
    };
  });

  app.post("/users/:id/block", writeLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({ reason: z.string().trim().min(3, "Укажите причину").max(500) })
      .parse(request.body ?? {});

    if (id === currentAdminId(request)) throw badRequest("Нельзя заблокировать себя");

    const row = await queryOne<{ id: string }>(
      `UPDATE users SET blocked_at = now(), blocked_reason = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, body.reason],
    );
    if (!row) throw notFound("Пользователь не найден");

    // Блокировка действует сразу: все активные сессии отзываем.
    await revokeAllForUser(id);
    await logAdminAction(request, "user.block", "user", id, body.reason);
    return { ok: true as const };
  });

  app.post("/users/:id/unblock", writeLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const row = await queryOne<{ id: string }>(
      `UPDATE users SET blocked_at = NULL, blocked_reason = NULL, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!row) throw notFound("Пользователь не найден");
    await logAdminAction(request, "user.unblock", "user", id);
    return { ok: true as const };
  });

  app.delete("/users/:id", destructiveLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({ reason: z.string().trim().max(500).default("") })
      .parse(request.body ?? {});

    if (id === currentAdminId(request)) throw badRequest("Нельзя удалить свой аккаунт из админки");

    const row = await queryOne<{ id: string }>(
      `UPDATE users SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    if (!row) throw notFound("Пользователь не найден");

    await revokeAllForUser(id);
    await query(
      `INSERT INTO deletion_requests (user_id, comment, restore_until)
       VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
      [id, `Удалён модератором: ${body.reason}`, String(env.ACCOUNT_RESTORE_DAYS)],
    );
    await logAdminAction(request, "user.delete", "user", id, body.reason);
    return { ok: true as const };
  });

  // ── Жалобы ────────────────────────────────────────────────────────────────

  app.get("/reports", async (request) => {
    const { page, limit, state } = pageQuery
      .extend({ state: z.enum(["new", "in_review", "resolved", "rejected"]).optional() })
      .parse(request.query);

    const params: (string | number)[] = [];
    let whereSql = "";
    if (state) {
      params.push(state);
      whereSql = `WHERE r.state = $${params.length}::report_state`;
    }

    const total = await queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM reports r ${whereSql}`,
      params,
    );

    params.push(limit, (page - 1) * limit);
    const rows = await query(
      `SELECT r.id, r.category, r.source, r.details, r.state, r.review_hours,
              r.created_at, r.resolved_at,
              r.reporter_id, r.subject_id,
              rp.name AS reporter_name, sp.name AS subject_name
         FROM reports r
         LEFT JOIN profiles rp ON rp.user_id = r.reporter_id
         LEFT JOIN profiles sp ON sp.user_id = r.subject_id
         ${whereSql}
        ORDER BY r.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return paged(
      rows.map((row) => ({
        id: row.id as string,
        category: row.category as string,
        source: row.source as string,
        details: row.details as string,
        state: row.state as string,
        reviewHours: row.review_hours as number,
        reporterId: row.reporter_id as string,
        reporterName: (row.reporter_name as string | null) ?? "",
        subjectId: row.subject_id as string,
        subjectName: (row.subject_name as string | null) ?? "",
        createdAt: row.created_at as Date,
        resolvedAt: (row.resolved_at as Date | null) ?? null,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });

  app.patch("/reports/:id", writeLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        state: z.enum(["new", "in_review", "resolved", "rejected"]),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(request.body ?? {});

    const row = await queryOne<{ id: string }>(
      `UPDATE reports
          SET state = $2::report_state,
              moderator_id = $3,
              resolved_at = CASE WHEN $2 IN ('resolved', 'rejected') THEN now() ELSE NULL END
        WHERE id = $1 RETURNING id`,
      [id, body.state, currentAdminId(request)],
    );
    if (!row) throw notFound("Жалоба не найдена");

    await logAdminAction(request, `report.${body.state}`, "report", id, body.note);
    return { ok: true as const };
  });

  // ── Верификации ───────────────────────────────────────────────────────────

  app.get("/verifications", async (request) => {
    const { page, limit, status } = pageQuery
      .extend({ status: z.enum(["pending", "verified", "rejected"]).default("pending") })
      .parse(request.query);

    const total = await queryOne<{ count: string }>(
      "SELECT count(*)::text AS count FROM verifications WHERE status = $1::verification_status",
      [status],
    );

    const rows = await query(
      `SELECT v.id, v.user_id, v.status, v.confidence, v.reason, v.manual, v.challenge,
              v.submitted_at, v.reviewed_at, v.reviewer_note,
              u.email::text AS email, p.name, p.city, p.trust_level
         FROM verifications v
         JOIN users u ON u.id = v.user_id
         LEFT JOIN profiles p ON p.user_id = v.user_id
        WHERE v.status = $1::verification_status
        ORDER BY v.submitted_at
        LIMIT $2 OFFSET $3`,
      [status, limit, (page - 1) * limit],
    );

    return paged(
      rows.map((row) => ({
        id: row.id as string,
        userId: row.user_id as string,
        email: row.email as string,
        name: (row.name as string | null) ?? "",
        city: (row.city as string | null) ?? "",
        trustLevel: (row.trust_level as string | null) ?? "new",
        status: row.status as string,
        confidence: (row.confidence as number | null) ?? null,
        reason: (row.reason as string | null) ?? "",
        manual: Boolean(row.manual),
        challenge: (row.challenge as string | null) ?? "",
        reviewerNote: (row.reviewer_note as string | null) ?? "",
        submittedAt: row.submitted_at as Date,
        reviewedAt: (row.reviewed_at as Date | null) ?? null,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });

  app.patch("/verifications/:id", writeLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        status: z.enum(["verified", "rejected"]),
        note: z.string().trim().max(500).default(""),
      })
      .parse(request.body ?? {});

    const row = await queryOne<{ user_id: string }>(
      `UPDATE verifications
          SET status = $2::verification_status,
              manual = true,
              reviewer_id = $3,
              reviewer_note = $4,
              reviewed_at = now()
        WHERE id = $1 RETURNING user_id`,
      [id, body.status, currentAdminId(request), body.note],
    );
    if (!row) throw notFound("Заявка не найдена");

    if (body.status === "verified") {
      await query(
        `UPDATE profiles
            SET video_verified = true,
                trust_level = CASE WHEN trust_level = 'new' THEN 'verified' ELSE trust_level END,
                trust_score = LEAST(100, trust_score + 20),
                updated_at = now()
          WHERE user_id = $1`,
        [row.user_id],
      );
    } else {
      await query(
        `UPDATE profiles SET video_verified = false, updated_at = now() WHERE user_id = $1`,
        [row.user_id],
      );
    }

    await logAdminAction(request, `verification.${body.status}`, "verification", id, body.note);
    return { ok: true as const };
  });

  // ── Поддержка ─────────────────────────────────────────────────────────────

  app.get("/support", async (request) => {
    const { page, limit, status } = pageQuery
      .extend({ status: z.enum(["new", "in_progress", "closed"]).optional() })
      .parse(request.query);

    const params: (string | number)[] = [];
    let whereSql = "";
    if (status) {
      params.push(status);
      whereSql = `WHERE s.status = $${params.length}`;
    }

    const total = await queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM support_requests s ${whereSql}`,
      params,
    );

    params.push(limit, (page - 1) * limit);
    const rows = await query(
      `SELECT s.id, s.user_id, s.email, s.topic, s.message, s.status,
              s.reply, s.replied_at, s.created_at, p.name
         FROM support_requests s
         LEFT JOIN profiles p ON p.user_id = s.user_id
         ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return paged(
      rows.map((row) => ({
        id: row.id as string,
        userId: (row.user_id as string | null) ?? null,
        name: (row.name as string | null) ?? "",
        email: row.email as string,
        topic: row.topic as string,
        message: row.message as string,
        status: row.status as string,
        reply: (row.reply as string | null) ?? "",
        repliedAt: (row.replied_at as Date | null) ?? null,
        createdAt: row.created_at as Date,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });

  app.patch("/support/:id", writeLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        status: z.enum(["new", "in_progress", "closed"]).optional(),
        reply: z.string().trim().min(5, "Ответ слишком короткий").max(4000).optional(),
      })
      .parse(request.body ?? {});

    if (!body.status && !body.reply) throw badRequest("Нечего обновлять");

    const row = await queryOne<{ email: string; topic: string; message: string }>(
      `UPDATE support_requests
          SET status = COALESCE($2, status),
              reply = COALESCE($3, reply),
              replied_at = CASE WHEN $3 IS NULL THEN replied_at ELSE now() END,
              replied_by = CASE WHEN $3 IS NULL THEN replied_by ELSE $4 END
        WHERE id = $1
        RETURNING email, topic, message`,
      [id, body.status ?? null, body.reply ?? null, currentAdminId(request)],
    );
    if (!row) throw notFound("Обращение не найдено");

    if (body.reply) {
      // Недоставленное письмо не должно отменять сохранённый ответ.
      try {
        await sendMail({
          to: row.email,
          subject: "Ответ поддержки «Я Онлайн»",
          text: `Здравствуйте!\n\n${body.reply}\n\n— Команда «Я Онлайн»\n\n---\nВаше обращение:\n${row.message}`,
        });
      } catch (error) {
        request.log.error({ err: error }, "[admin] письмо с ответом поддержки не ушло");
      }
    }

    await logAdminAction(request, "support.update", "support", id, body.status ?? "reply");
    return { ok: true as const };
  });

  // ── Объявления «Рядом» ────────────────────────────────────────────────────

  app.get("/listings", async (request) => {
    const { q, page, limit, state } = pageQuery
      .extend({ state: z.enum(["active", "closed", "expired"]).optional() })
      .parse(request.query);

    const where: string[] = [];
    const params: (string | number)[] = [];
    if (state) {
      params.push(state);
      where.push(`l.state = $${params.length}::listing_state`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(l.title ILIKE $${params.length} OR l.city ILIKE $${params.length})`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const total = await queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM listings l ${whereSql}`,
      params,
    );

    params.push(limit, (page - 1) * limit);
    const rows = await query(
      `SELECT l.id, l.author_id, l.category, l.city, l.title, l.description,
              l.price_minor, l.currency, l.state, l.expires_at, l.created_at,
              p.name AS author_name, p.trust_level
         FROM listings l
         LEFT JOIN profiles p ON p.user_id = l.author_id
         ${whereSql}
        ORDER BY l.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return paged(
      rows.map((row) => ({
        id: row.id as string,
        authorId: row.author_id as string,
        authorName: (row.author_name as string | null) ?? "",
        trustLevel: (row.trust_level as string | null) ?? "new",
        category: row.category as string,
        city: row.city as string,
        title: row.title as string,
        description: row.description as string,
        priceMinor: (row.price_minor as number | null) ?? null,
        currency: row.currency as string,
        state: row.state as string,
        expiresAt: row.expires_at as Date,
        createdAt: row.created_at as Date,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });

  app.patch("/listings/:id", writeLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        state: z.enum(["active", "closed"]).default("closed"),
        note: z.string().trim().max(500).default(""),
      })
      .parse(request.body ?? {});

    const row = await queryOne<{ id: string }>(
      `UPDATE listings SET state = $2::listing_state, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, body.state],
    );
    if (!row) throw notFound("Объявление не найдено");

    await logAdminAction(request, `listing.${body.state}`, "listing", id, body.note);
    return { ok: true as const };
  });

  // ── Сообщества ────────────────────────────────────────────────────────────

  app.get("/spaces", async (request) => {
    const { q, page, limit } = pageQuery.parse(request.query);

    const params: (string | number)[] = [];
    let whereSql = "";
    if (q) {
      params.push(`%${q}%`);
      whereSql = `WHERE (s.title ILIKE $${params.length} OR s.city ILIKE $${params.length})`;
    }

    const total = await queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM spaces s ${whereSql}`,
      params,
    );

    params.push(limit, (page - 1) * limit);
    const rows = await query(
      `SELECT s.id, s.title, s.category, s.format, s.city, s.verified_community,
              s.host_id, s.created_at, p.name AS host_name,
              (SELECT count(*) FROM space_members m WHERE m.space_id = s.id)::int AS members,
              (SELECT count(*) FROM space_events e WHERE e.space_id = s.id
                 AND e.starts_at > now())::int AS upcoming_events
         FROM spaces s
         LEFT JOIN profiles p ON p.user_id = s.host_id
         ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return paged(
      rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        category: row.category as string,
        format: row.format as string,
        city: row.city as string,
        verifiedCommunity: Boolean(row.verified_community),
        hostId: row.host_id as string,
        hostName: (row.host_name as string | null) ?? "",
        members: row.members as number,
        upcomingEvents: row.upcoming_events as number,
        createdAt: row.created_at as Date,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });

  app.delete("/spaces/:id", destructiveLimit, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({ reason: z.string().trim().max(500).default("") })
      .parse(request.body ?? {});

    // Журнал пишем до удаления: после DELETE title уже не прочитать.
    const space = await queryOne<{ title: string }>("SELECT title FROM spaces WHERE id = $1", [id]);
    if (!space) throw notFound("Сообщество не найдено");

    await logAdminAction(
      request,
      "space.delete",
      "space",
      id,
      body.reason ? `${space.title}: ${body.reason}` : space.title,
    );
    await query("DELETE FROM spaces WHERE id = $1", [id]);
    return { ok: true as const };
  });

  // ── Статистика ────────────────────────────────────────────────────────────

  app.get("/stats", async (request) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(90).default(30) })
      .parse(request.query);

    const [signups, totals] = await Promise.all([
      query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                count(u.id)::int AS count
           FROM generate_series(
                  (now() - ($1 || ' days')::interval)::date, now()::date, interval '1 day'
                ) AS d(day)
           LEFT JOIN users u
             ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day'
          GROUP BY d.day ORDER BY d.day`,
        [String(days)],
      ),
      queryOne<Record<string, string>>(
        `SELECT
           (SELECT count(*)::text FROM users WHERE deleted_at IS NULL) AS users_total,
           (SELECT count(*)::text FROM users WHERE blocked_at IS NOT NULL) AS users_blocked,
           (SELECT count(*)::text FROM profiles WHERE video_verified) AS users_verified,
           (SELECT count(*)::text FROM refresh_tokens
             WHERE revoked_at IS NULL AND expires_at > now()) AS active_sessions,
           (SELECT count(*)::text FROM matches
             WHERE created_at > now() - ($1 || ' days')::interval) AS matches,
           (SELECT count(*)::text FROM messages
             WHERE created_at > now() - ($1 || ' days')::interval) AS messages,
           (SELECT count(*)::text FROM listings
             WHERE created_at > now() - ($1 || ' days')::interval) AS listings,
           (SELECT count(*)::text FROM listings WHERE state = 'active') AS listings_active,
           (SELECT count(*)::text FROM reports WHERE state IN ('new', 'in_review')) AS reports_open,
           (SELECT count(*)::text FROM verifications WHERE status = 'pending') AS verifications_pending,
           (SELECT count(*)::text FROM support_requests WHERE status <> 'closed') AS support_open`,
        [String(days)],
      ),
    ]);

    const n = (key: string) => Number(totals?.[key] ?? 0);
    return {
      periodDays: days,
      signupsByDay: signups.map((row) => ({
        day: row.day as string,
        count: row.count as number,
      })),
      usersTotal: n("users_total"),
      usersBlocked: n("users_blocked"),
      usersVerified: n("users_verified"),
      activeSessions: n("active_sessions"),
      matches: n("matches"),
      messages: n("messages"),
      listings: n("listings"),
      listingsActive: n("listings_active"),
      reportsOpen: n("reports_open"),
      verificationsPending: n("verifications_pending"),
      supportOpen: n("support_open"),
    };
  });

  // ── Журнал действий администраторов ───────────────────────────────────────

  app.get("/actions", async (request) => {
    const { page, limit } = pageQuery.parse(request.query);
    const total = await queryOne<{ count: string }>(
      "SELECT count(*)::text AS count FROM admin_actions",
    );
    const rows = await query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.note, a.created_at,
              u.email::text AS admin_email
         FROM admin_actions a
         LEFT JOIN users u ON u.id = a.admin_id
        ORDER BY a.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );
    return paged(
      rows.map((row) => ({
        id: row.id as string,
        adminEmail: (row.admin_email as string | null) ?? "",
        action: row.action as string,
        targetType: row.target_type as string,
        targetId: (row.target_id as string | null) ?? null,
        note: row.note as string,
        createdAt: row.created_at as Date,
      })),
      Number(total?.count ?? 0),
      page,
      limit,
    );
  });
}
