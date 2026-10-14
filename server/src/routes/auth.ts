/**
 * POST /api/auth/register   — регистрация (18+, сильный пароль)
 * POST /api/auth/login      — вход, отдаёт { token, user }
 * POST /api/auth/refresh    — обновление access-токена по refresh
 * POST /api/auth/logout     — отзыв refresh-токена
 * GET  /api/auth/me         — текущий пользователь
 *
 * Ответ login/register совпадает с типом Session фронтенда: { token, user }.
 * Refresh-токен отдаём в httpOnly-cookie — из JS он недоступен (защита от XSS).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { HttpError, badRequest, forbidden, unauthorized } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { hashPassword, isStrongEnough, verifyPassword } from "../auth/passwords.ts";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../auth/tokens.ts";
import { toUserDto, type ProfileRow } from "../types.ts";
import { transaction } from "../db.ts";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  checkRequestLimits,
  codesMatch,
  generateCode,
  hashCode,
  normalizePhone,
} from "../auth/phone.ts";
import { getSmsProvider, maskPhone, otpText } from "../sms/provider.ts";

/** Счётчики «запрошено / подтверждено» для журнала: видно накрутку и падение доставки. */
const smsStats = { requested: 0, sent: 0, verified: 0, failed: 0 };

const REFRESH_COOKIE = "ya_refresh";

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
});

const PROFILE_SELECT = `
  SELECT u.id, p.name, p.age, p.city, p.bio, p.trust_level, p.trust_score, u.last_seen_at,
         (SELECT url FROM profile_media
           WHERE user_id = u.id AND kind = 'photo'
           ORDER BY is_primary DESC, position LIMIT 1) AS avatar_url,
         ARRAY(
           SELECT i.label FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
            WHERE ui.user_id = u.id
         ) AS interests
    FROM users u
    JOIN profiles p ON p.user_id = u.id
   WHERE u.id = $1 AND u.deleted_at IS NULL
`;


export async function authRoutes(app: FastifyInstance) {
  function setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProd,
      path: "/api/auth",
      maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60,
    });
  }

  // Регистрация. Профиль заполняется позже, в онбординге.
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const body = credentials.extend({ name: z.string().min(2).max(80) }).parse(request.body);
    if (!isStrongEnough(body.password)) {
      throw badRequest("Пароль слишком простой: минимум 10 знаков, буквы и цифры");
    }

    const exists = await queryOne("SELECT 1 FROM users WHERE email = $1", [body.email]);
    // Не подтверждаем существование адреса явно — но и молча дублировать нельзя.
    if (exists) throw badRequest("Не удалось создать аккаунт с этими данными");

    const passwordHash = await hashPassword(body.password);
    const user = await queryOne<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [body.email, passwordHash],
    );
    if (!user) throw badRequest("Не удалось создать аккаунт");

    await query("INSERT INTO profiles (user_id, name) VALUES ($1, $2)", [user.id, body.name]);
    await query("INSERT INTO privacy_settings (user_id) VALUES ($1)", [user.id]);
    await query("INSERT INTO notification_prefs (user_id) VALUES ($1)", [user.id]);
    await query("INSERT INTO subscriptions (user_id) VALUES ($1)", [user.id]);

    const token = await signAccessToken(user.id);
    setRefreshCookie(reply, await issueRefreshToken(user.id, { userAgent: request.headers["user-agent"], ip: request.ip }));

    const row = await queryOne<ProfileRow>(PROFILE_SELECT, [user.id]);
    return { token, user: row ? toUserDto(row) : null };
  });

  // Вход. Отдельный жёсткий rate limit: защита от перебора пароля.
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const body = credentials.parse(request.body);

    const account = await queryOne<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM users WHERE email = $1 AND deleted_at IS NULL",
      [body.email],
    );

    const ok = account ? await verifyPassword(account.password_hash, body.password) : false;
    await query("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)", [
      body.email,
      request.ip,
      ok,
    ]);
    // Одинаковый текст для «нет такого email» и «неверный пароль»:
    // иначе перебором можно узнать, кто зарегистрирован.
    if (!ok || !account) throw unauthorized("Неверный email или пароль");

    await query("UPDATE users SET last_seen_at = now() WHERE id = $1", [account.id]);

    const token = await signAccessToken(account.id);
    setRefreshCookie(reply, await issueRefreshToken(account.id, { userAgent: request.headers["user-agent"], ip: request.ip }));

    const row = await queryOne<ProfileRow>(PROFILE_SELECT, [account.id]);
    return { token, user: row ? toUserDto(row) : null };
  });

  // ── Вход по номеру телефона ──────────────────────────────────────────────
  const sms = getSmsProvider(app.log);
  const phoneBody = z.object({ phone: z.string().min(5).max(32) });

  app.post("/phone/request", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (request, reply) => {
    const { phone: raw } = phoneBody.parse(request.body);
    const phone = normalizePhone(raw);
    if (!phone) throw badRequest("Проверьте номер телефона");

    // Чистим старьё при каждом запросе: таймер не нужен.
    await query("DELETE FROM auth_otps WHERE created_at < now() - interval '2 days'");

    const limit = await checkRequestLimits(phone, request.ip);
    if (!limit.ok) {
      return reply
        .status(429)
        .header("retry-after", String(limit.retryAfter))
        .send({ message: limit.message, retryAfter: limit.retryAfter });
    }

    const code = generateCode(phone);
    await transaction(async (client) => {
      // Ошибки ввода переносятся на новый код: выдача кода не обнуляет попытки.
      const prev = await client.query<{ attempts: number }>(
        `UPDATE auth_otps SET consumed_at = now()
          WHERE phone = $1 AND consumed_at IS NULL AND created_at > now() - interval '1 hour'
          RETURNING attempts`,
        [phone],
      );
      const carried = Math.max(0, ...prev.rows.map((row) => row.attempts));
      await client.query(
        `INSERT INTO auth_otps (phone, code_hash, expires_at, attempts, ip)
         VALUES ($1, $2, now() + ($3::int * interval '1 millisecond'), $4, $5)`,
        [phone, hashCode(phone, code), OTP_TTL_MS, carried, request.ip],
      );
    });

    smsStats.requested += 1;
    if (!env.testPhones.has(phone)) {
      try {
        await sms.send(phone, otpText(code));
        smsStats.sent += 1;
      } catch (error) {
        smsStats.failed += 1;
        request.log.warn({ phone: maskPhone(phone), err: (error as Error).message }, "[sms] не отправлено");
      }
    }
    request.log.info({ phone: maskPhone(phone), stats: smsStats }, "[sms] код запрошен");
    // Одинаковый ответ: по нему нельзя понять, есть ли такой пользователь.
    return reply.status(204).send();
  });

  app.post("/phone/verify", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const body = phoneBody.extend({ code: z.string().regex(/^\d{6}$/, "Код — 6 цифр") }).parse(request.body);
    const phone = normalizePhone(body.phone);
    if (!phone) throw badRequest("Проверьте номер телефона");

    const otp = await queryOne<{ id: string; code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT id, code_hash, expires_at, attempts FROM auth_otps
        WHERE phone = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    if (!otp) throw new HttpError(400, "Код недействителен — запросите новый", "otp_missing");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await query("UPDATE auth_otps SET consumed_at = now() WHERE id = $1", [otp.id]);
      throw new HttpError(400, "Слишком много попыток — запросите новый код", "otp_attempts");
    }
    if (otp.expires_at.getTime() < Date.now()) {
      throw new HttpError(400, "Срок кода истёк — запросите новый", "otp_expired");
    }
    if (!codesMatch(otp.code_hash, phone, body.code)) {
      const next = otp.attempts + 1;
      await query(
        `UPDATE auth_otps SET attempts = $2, consumed_at = CASE WHEN $2 >= $3 THEN now() ELSE NULL END WHERE id = $1`,
        [otp.id, next, OTP_MAX_ATTEMPTS],
      );
      throw new HttpError(
        400,
        next >= OTP_MAX_ATTEMPTS ? "Слишком много попыток — запросите новый код" : "Неверный код",
        next >= OTP_MAX_ATTEMPTS ? "otp_attempts" : "otp_invalid",
      );
    }
    // Помечаем использованным атомарно: повторная отправка того же кода не пройдёт.
    const consumed = await queryOne<{ id: string }>(
      "UPDATE auth_otps SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id",
      [otp.id],
    );
    if (!consumed) throw new HttpError(400, "Код уже использован — запросите новый", "otp_missing");

    let isNew = false;
    let account = await queryOne<{ id: string; deleted_at: Date | null; blocked_at: Date | null }>(
      "SELECT id, deleted_at, blocked_at FROM users WHERE phone = $1",
      [phone],
    );
    if (account?.blocked_at) throw forbidden("Аккаунт заблокирован модератором");
    if (account?.deleted_at) throw forbidden("Аккаунт удалён");

    if (!account) {
      isNew = true;
      const id = await transaction(async (client) => {
        const created = await client.query<{ id: string }>(
          "INSERT INTO users (phone, phone_verified) VALUES ($1, true) RETURNING id",
          [phone],
        );
        const userId = created.rows[0]!.id;
        await client.query("INSERT INTO profiles (user_id, name) VALUES ($1, '')", [userId]);
        await client.query("INSERT INTO privacy_settings (user_id) VALUES ($1)", [userId]);
        await client.query("INSERT INTO notification_prefs (user_id) VALUES ($1)", [userId]);
        await client.query("INSERT INTO subscriptions (user_id) VALUES ($1)", [userId]);
        await client.query(
          "INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'phone', $2) ON CONFLICT DO NOTHING",
          [userId, phone],
        );
        return userId;
      });
      account = { id, deleted_at: null, blocked_at: null };
    } else {
      await query("UPDATE users SET phone_verified = true, last_seen_at = now() WHERE id = $1", [account.id]);
      await query(
        "INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'phone', $2) ON CONFLICT DO NOTHING",
        [account.id, phone],
      );
    }

    smsStats.verified += 1;
    request.log.info({ phone: maskPhone(phone), isNew, stats: smsStats }, "[sms] код подтверждён");

    const token = await signAccessToken(account.id);
    setRefreshCookie(reply, await issueRefreshToken(account.id, { userAgent: request.headers["user-agent"], ip: request.ip }));
    const row = await queryOne<ProfileRow>(PROFILE_SELECT, [account.id]);
    return { token, user: row ? toUserDto(row) : null, isNew };
  });

  app.post("/refresh", async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw unauthorized("Нет refresh-токена");

    const { userId, next } = await rotateRefreshToken(token, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    setRefreshCookie(reply, next);
    return { token: await signAccessToken(userId) };
  });

  app.post("/logout", async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    const userId = currentUserId(request);
    const row = await queryOne<ProfileRow>(PROFILE_SELECT, [userId]);
    if (!row) throw unauthorized("Профиль не найден");
    await query("UPDATE users SET last_seen_at = now() WHERE id = $1", [userId]);
    return toUserDto(row);
  });
}
