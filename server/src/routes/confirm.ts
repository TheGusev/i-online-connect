import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { transaction } from "../db.ts";
import { env } from "../env.ts";
import { HttpError, badRequest, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { hashCode, codesMatch } from "../auth/phone.ts";
import { confirmationEmail, sendMail } from "../mail/smtp.ts";

export async function confirmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  const requestLimit = { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } };
  app.post("/email/request", requestLimit, async request => {
    if (!env.SMTP_HOST) throw new HttpError(503, "Подтверждение почты временно недоступно");
    const userId = currentUserId(request);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const issued = await transaction(async client => {
      // One lock serializes account + IP counters across all worker processes.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('email-confirm-limits'))");
      const account = (await client.query<{ email: string | null; email_verified: boolean; name: string }>(
        `SELECT u.email, u.email_verified, COALESCE(p.name,'') AS name FROM users u
         LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`, [userId])).rows[0];
      if (!account) throw notFound("Аккаунт не найден");
      if (account.email_verified) return null;
      if (!account.email) throw badRequest("Добавьте почту в настройках аккаунта или привяжите Яндекс/Telegram");
      const stats = (await client.query<{ account_count: number; ip_count: number; last_at: Date | null }>(
        `SELECT count(*) FILTER (WHERE user_id=$1)::int AS account_count,
          count(*) FILTER (WHERE ip=$2)::int AS ip_count,
          max(created_at) FILTER (WHERE user_id=$1) AS last_at FROM contact_confirmations
          WHERE channel='email' AND created_at>now()-interval '1 hour'`, [userId, request.ip])).rows[0];
      if ((stats?.account_count ?? 0) >= 5 || (stats?.ip_count ?? 0) >= 20 ||
          (stats?.last_at && Date.now()-stats.last_at.getTime()<60_000)) {
        throw new HttpError(429, "Слишком много запросов. Попробуйте позже");
      }
      const previous = await client.query<{ attempts: number }>(
        `UPDATE contact_confirmations SET consumed_at=now() WHERE user_id=$1 AND channel='email'
          AND consumed_at IS NULL RETURNING attempts`, [userId]);
      const attempts = Math.max(0, ...previous.rows.map(row => row.attempts));
      const row = (await client.query<{ id: string }>(
        `INSERT INTO contact_confirmations (user_id,channel,destination,code_hash,expires_at,attempts,ip)
          VALUES ($1,'email',$2,$3,now()+interval '10 minutes',$4,$5) RETURNING id`,
        [userId, account.email, hashCode(`confirm:${userId}:${account.email}`, code), attempts >= 5 ? 0 : attempts, request.ip])).rows[0];
      return { ...account, id: row?.id };
    });
    if (!issued) return { status: "verified" as const, sent: false };
    try {
      const result = await sendMail({ to: issued.email ?? "", ...confirmationEmail(code, issued.name) });
      if (!result.sent) throw new Error("Delivery unavailable");
    } catch {
      request.log.warn("[confirm] Ошибка доставки письма");
      throw new HttpError(503, "Не удалось отправить письмо. Попробуйте позже");
    }
    return { status: "sent" as const, expiresInMinutes: 10 };
  });
  const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Код состоит из 6 цифр") });
  app.post("/email/verify", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async request => {
    const { code } = codeSchema.parse(request.body);
    const userId = currentUserId(request);
    // Return errors from the transaction rather than throwing, so wrong attempts commit.
    const error = await transaction(async client => {
      const account = (await client.query<{ email: string | null }>("SELECT email FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [userId])).rows[0];
      const row = (await client.query<{ id: string; code_hash: string; attempts: number; expires_at: Date; destination: string }>(
        `SELECT id,code_hash,attempts,expires_at,destination FROM contact_confirmations
         WHERE user_id=$1 AND channel='email' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [userId])).rows[0];
      if (!row || row.expires_at.getTime() <= Date.now() || row.destination !== account?.email) return "Код истёк — запросите новый";
      if (row.attempts >= 5) return "Слишком много попыток — запросите новый код";
      const valid = codesMatch(row.code_hash, `confirm:${userId}:${row.destination}`, code);
      await client.query(`UPDATE contact_confirmations SET attempts=attempts+1,
        consumed_at=CASE WHEN $2 OR attempts+1>=5 THEN now() ELSE NULL END WHERE id=$1`, [row.id, valid]);
      if (!valid) return "Код не совпадает";
      await client.query("UPDATE users SET email_verified=true, updated_at=now() WHERE id=$1 AND email=$2", [userId, row.destination]);
      return null;
    });
    if (error) throw badRequest(error);
    return { status: "verified" as const };
  });
  for (const suffix of ["request", "verify"]) {
    app.post(`/phone/${suffix}`, async () => {
      if (env.PHONE_LOGIN_ENABLED !== "true") throw notFound("Не найдено");
      throw new HttpError(410, "Используйте привязку номера через SMS в настройках аккаунта");
    });
  }
}
