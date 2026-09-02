/**
 * POST /api/admin/session — вход в админку. Единственный открытый маршрут
 * в /api/admin/*, всё остальное закрыто requireAdmin.
 *
 * Три фактора подряд, порядок важен:
 *   1) honeypot + капча — отсекают ботов до обращения к БД;
 *   2) email + пароль (argon2id);
 *   3) одноразовый код TOTP из приложения-аутентификатора.
 *
 * Ответы намеренно одинаковые на любой неверный шаг: «Не удалось войти».
 * Так снаружи нельзя выяснить, существует ли админ с таким адресом и на чём
 * именно остановилась попытка. Все попытки пишутся в admin_login_attempts.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { adminSessionSeconds, signAdminToken } from "../auth/admin-tokens.ts";
import { verifyPassword } from "../auth/passwords.ts";
import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { forbidden } from "../http.ts";
import { assertCaptcha, isBotTrapped } from "../security/captcha.ts";
import { verifyTotpCode } from "../security/totp.ts";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Проверьте адрес").max(254),
  password: z.string().min(1).max(200),
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Код состоит из 6 цифр"),
  captchaToken: z.string().max(4096).optional(),
  // Скрытое поле-ловушка: человек его не видит и не заполняет.
  contactFax: z.string().max(200).optional(),
});

type Outcome = "password" | "role" | "totp" | "ok";

export async function adminSessionRoutes(app: FastifyInstance) {
  async function record(email: string, ip: string, outcome: Outcome) {
    await query(
      "INSERT INTO admin_login_attempts (email, ip, outcome) VALUES ($1, $2, $3)",
      [email, ip, outcome],
    ).catch(() => undefined);
  }

  app.post(
    "/session",
    {
      // Пять попыток за 10 минут на адрес: перебор пароля и шестизначного
      // кода становится бессмысленным. Ключ — IP, токена здесь ещё нет.
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request) => {
      if (!env.adminLoginEnabled) {
        request.log.error(
          "[admin] вход отключён: задайте JWT_ADMIN_SECRET и TOTP_ENCRYPTION_KEY",
        );
        throw forbidden("Нет доступа");
      }

      // Ловушка сработала — отвечаем обычной ошибкой входа и ничего не делаем.
      if (isBotTrapped(request.body)) throw forbidden("Не удалось войти");

      const body = bodySchema.parse(request.body);
      await assertCaptcha(body.captchaToken, request.ip, request.log);

      const account = await queryOne<{
        id: string;
        password_hash: string;
        role: string;
        blocked_at: string | null;
        totp_secret: string | null;
      }>(
        `SELECT id, password_hash, role, blocked_at, totp_secret
           FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [body.email],
      );

      // Пароль проверяем всегда, когда аккаунт найден — даже если роль не
      // подходит: одинаковое время ответа не выдаёт наличие админа.
      const passwordOk = account
        ? await verifyPassword(account.password_hash, body.password)
        : false;

      if (!account || !passwordOk) {
        await record(body.email, request.ip, "password");
        throw forbidden("Не удалось войти");
      }

      if (account.role !== "admin" || account.blocked_at || !account.totp_secret) {
        await record(body.email, request.ip, "role");
        throw forbidden("Не удалось войти");
      }

      const totpOk = await verifyTotpCode(account.id, account.totp_secret, body.totp);
      if (!totpOk) {
        await record(body.email, request.ip, "totp");
        throw forbidden("Не удалось войти");
      }

      await record(body.email, request.ip, "ok");
      request.log.warn({ adminId: account.id, ip: request.ip }, "[admin] вход в админку");

      // Токен возвращаем в теле, а не в cookie: админка держит его в
      // sessionStorage — закрытие вкладки завершает сессию.
      return {
        token: await signAdminToken(account.id),
        expiresIn: adminSessionSeconds(),
      };
    },
  );
}
