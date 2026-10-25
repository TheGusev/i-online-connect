import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { queryOne, transaction } from "../db.ts";
import { env } from "../env.ts";
import { badRequest } from "../http.ts";
import { hashCode, codesMatch, RESEND_STEPS_S, PER_PHONE_HOURLY, PER_IP_HOURLY } from "../auth/phone.ts";
import { hashPassword, isStrongEnough } from "../auth/passwords.ts";
import { revokeAllForUser } from "../auth/tokens.ts";
import { sendMail } from "../mail/smtp.ts";
import { providerEnabled } from "../auth/oauth-providers.ts";

const emailBody = z.object({ email: z.string().email().max(254) });
export async function passwordResetRoutes(app: FastifyInstance) {
  app.get("/config", async () => ({ passwordResetEnabled: Boolean(env.SMTP_HOST), providers: { yandex: providerEnabled("yandex"), telegram: providerEnabled("telegram") } }));
  app.post("/password/reset/request", async (request, reply) => {
    const { email } = emailBody.parse(request.body);
    if (!env.SMTP_HOST) return reply.status(204).send();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const allowed = await transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('email-reset-limits'))");
      const stats = await client.query<{ hour_count: string; streak: string; last_at: Date | null }>(
        `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour_count,
         count(*) FILTER (WHERE created_at > now() - interval '15 minutes') AS streak, max(created_at) AS last_at
         FROM auth_email_codes WHERE email = $1`, [email]);
      const row = stats.rows[0];
      const pause = RESEND_STEPS_S[Math.min(Math.max(Number(row?.streak ?? 0) - 1, 0), 2)] ?? 60;
      if (Number(row?.hour_count ?? 0) >= PER_PHONE_HOURLY || (row?.last_at && Date.now() - row.last_at.getTime() < pause * 1000)) return false;
      const counts = await client.query<{ ip_count: string; daily: string }>(`SELECT
        count(*) FILTER (WHERE ip = $1 AND created_at > now() - interval '1 hour') AS ip_count,
        count(*) FILTER (WHERE created_at > now() - interval '1 day') AS daily FROM auth_email_codes`, [request.ip]);
      if (Number(counts.rows[0]?.ip_count ?? 0) >= PER_IP_HOURLY || Number(counts.rows[0]?.daily ?? 0) >= env.SMS_DAILY_LIMIT) return false;
      await client.query("UPDATE auth_email_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL", [email]);
      // Record every address, including unknown ones, to keep limits and responses indistinguishable.
      await client.query("INSERT INTO auth_email_codes (email, code_hash, expires_at, ip) VALUES ($1, $2, now() + interval '15 minutes', $3)", [email, hashCode(`reset:${email}`, code), request.ip]);
      return true;
    });
    if (allowed) {
      const account = await queryOne("SELECT id FROM users WHERE email = $1 AND email_verified = true AND deleted_at IS NULL AND blocked_at IS NULL", [email]);
      if (account) {
        try { await sendMail({ to: email, subject: "Восстановление пароля — Я Онлайн", text: `Код восстановления пароля: ${code}\nКод действует 15 минут. Если вы не запрашивали сброс, проигнорируйте письмо.` }); }
        catch { request.log.warn("[password-reset] Ошибка доставки письма"); }
      }
    }
    return reply.status(204).send();
  });
  app.post("/password/reset/confirm", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const body = emailBody.extend({ code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(10).max(200) }).parse(request.body);
    if (!isStrongEnough(body.newPassword)) throw badRequest("Пароль слишком простой: минимум 10 знаков, буквы и цифры");
    const passwordHash = await hashPassword(body.newPassword);
    const ok = await transaction(async client => {
      const result = await client.query<{ id: string; code_hash: string; attempts: number; expires_at: Date }>(
        "SELECT id, code_hash, attempts, expires_at FROM auth_email_codes WHERE email = $1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [body.email]);
      const otp = result.rows[0];
      if (!otp || otp.attempts >= 5 || otp.expires_at.getTime() <= Date.now()) return false;
      const valid = codesMatch(otp.code_hash, `reset:${body.email}`, body.code);
      await client.query("UPDATE auth_email_codes SET attempts = attempts + 1, consumed_at = CASE WHEN $2 OR attempts + 1 >= 5 THEN now() ELSE NULL END WHERE id = $1", [otp.id, valid]);
      if (!valid) return false;
      const updated = await client.query<{ id: string }>("UPDATE users SET password_hash = $2, updated_at = now() WHERE email = $1 AND email_verified = true AND deleted_at IS NULL AND blocked_at IS NULL RETURNING id", [body.email, passwordHash]);
      const account = updated.rows[0];
      if (!account) return false;
      await revokeAllForUser(account.id, client);
      await client.query("UPDATE auth_email_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL", [body.email]);
      return true;
    });
    if (!ok) throw badRequest("Код недействителен или истёк — запросите новый");
    return reply.status(204).send();
  });
}