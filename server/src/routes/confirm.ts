/**
 * POST /api/confirm/email/request  — выслать код на текущий email
 * POST /api/confirm/email/verify   — подтвердить email кодом
 * POST /api/confirm/phone/request  — выслать код на телефон
 * POST /api/confirm/phone/verify   — подтвердить телефон кодом
 *
 * Код — 6 цифр, живёт 15 минут, хранится только как SHA-256 хэш,
 * максимум 5 попыток ввода. Email уходит через SMTP (server/src/mail/smtp.ts),
 * код для телефона пока пишется в лог сервера — SMS-шлюз подключается позже
 * в одной функции sendPhoneCode.
 */
import { createHash, randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { badRequest, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { confirmationEmail, sendMail } from "../mail/smtp.ts";

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

type Channel = "email" | "phone";

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");
const newCode = () => String(randomInt(100000, 1000000));

async function sendPhoneCode(app: FastifyInstance, phone: string, code: string) {
  // SMS-провайдер пока не подключён: код виден в логе сервера (pm2 logs).
  app.log.info(`[confirm] код подтверждения телефона ${phone}: ${code}`);
}

export async function confirmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  async function loadAccount(userId: string) {
    const account = await queryOne<{
      email: string;
      phone: string | null;
      name: string;
      email_verified: boolean;
      phone_verified: boolean;
    }>(
      `SELECT u.email, u.phone, u.email_verified, u.phone_verified, COALESCE(p.name, '') AS name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (!account) throw notFound("Аккаунт не найден");
    return account;
  }

  async function issueCode(userId: string, channel: Channel, destination: string) {
    const code = newCode();
    // Прежние неиспользованные коды этого канала гасим: активен только последний.
    await query(
      "UPDATE contact_confirmations SET consumed_at = now() WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL",
      [userId, channel],
    );
    await query(
      `INSERT INTO contact_confirmations (user_id, channel, destination, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
      [userId, channel, destination, hashCode(code), String(CODE_TTL_MINUTES)],
    );
    return code;
  }

  const requestLimit = { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } };

  app.post("/email/request", requestLimit, async (request) => {
    const userId = currentUserId(request);
    const account = await loadAccount(userId);
    if (account.email_verified) return { status: "verified" as const, sent: false };

    const code = await issueCode(userId, "email", account.email);
    const { sent } = await sendMail({ to: account.email, ...confirmationEmail(code, account.name) });
    if (!sent) app.log.warn(`[confirm] код email ${account.email}: ${code}`);

    return { status: "sent" as const, destination: account.email, expiresInMinutes: CODE_TTL_MINUTES };
  });

  app.post("/phone/request", requestLimit, async (request) => {
    const userId = currentUserId(request);
    const account = await loadAccount(userId);
    if (!account.phone) throw badRequest("Сначала укажите номер телефона в настройках аккаунта");
    if (account.phone_verified) return { status: "verified" as const, sent: false };

    const code = await issueCode(userId, "phone", account.phone);
    await sendPhoneCode(app, account.phone, code);

    return { status: "sent" as const, destination: account.phone, expiresInMinutes: CODE_TTL_MINUTES };
  });

  const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Код состоит из 6 цифр") });

  async function verify(userId: string, channel: Channel, code: string) {
    const row = await queryOne<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM contact_confirmations
        WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [userId, channel],
    );
    if (!row) throw badRequest("Код истёк — запросите новый");
    if (row.attempts >= MAX_ATTEMPTS) {
      await query("UPDATE contact_confirmations SET consumed_at = now() WHERE id = $1", [row.id]);
      throw badRequest("Слишком много попыток — запросите новый код");
    }

    if (row.code_hash !== hashCode(code)) {
      await query("UPDATE contact_confirmations SET attempts = attempts + 1 WHERE id = $1", [row.id]);
      throw badRequest("Код не совпадает");
    }

    await query("UPDATE contact_confirmations SET consumed_at = now() WHERE id = $1", [row.id]);
    const column = channel === "email" ? "email_verified" : "phone_verified";
    await query(`UPDATE users SET ${column} = true WHERE id = $1`, [userId]);
    return { status: "verified" as const };
  }

  app.post("/email/verify", async (request) => {
    const { code } = codeSchema.parse(request.body);
    return verify(currentUserId(request), "email", code);
  });

  app.post("/phone/verify", async (request) => {
    const { code } = codeSchema.parse(request.body);
    return verify(currentUserId(request), "phone", code);
  });
}
