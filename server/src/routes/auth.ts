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
import { badRequest, unauthorized } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { hashPassword, isStrongEnough, verifyPassword } from "../auth/passwords.ts";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../auth/tokens.ts";
import { toUserDto, type ProfileRow } from "../types.ts";

const REFRESH_COOKIE = "ya_refresh";

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
});

const PROFILE_SELECT = `
  SELECT u.id, p.name, p.age, p.city, p.bio, p.trust_level, p.trust_score, u.last_seen_at,
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

  app.post("/refresh", async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw unauthorized("Нет refresh-токена");

    const { userId, next } = await rotateRefreshToken(token);
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
