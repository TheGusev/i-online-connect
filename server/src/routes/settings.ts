/**
 * GET    /api/settings                — SettingsBundle одним запросом
 * PATCH  /api/settings/account        — email, телефон, язык
 * PATCH  /api/settings/notifications  — переключатели уведомлений
 * POST   /api/settings/password       — смена пароля
 * DELETE /api/settings/account        — удаление с окном восстановления
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { badRequest, notFound, unauthorized } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { hashPassword, isStrongEnough, verifyPassword } from "../auth/passwords.ts";
import { revokeAllForUser } from "../auth/tokens.ts";

const PREMIUM_FEATURES = [
  { title: "Больше совпадений", description: "Дополнительные подборки в течение дня" },
  { title: "Кто вас сохранил", description: "Видно, кто отложил ваш профиль" },
  { title: "Приоритет в модерации", description: "Жалобы и верификация рассматриваются быстрее" },
];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  async function loadBundle(userId: string) {
    const account = await queryOne<{
      email: string;
      phone: string | null;
      language: string;
      email_verified: boolean;
      phone_verified: boolean;
    }>("SELECT email, phone, language, email_verified, phone_verified FROM users WHERE id = $1", [
      userId,
    ]);
    if (!account) throw notFound("Аккаунт не найден");

    const notifications = await queryOne<{
      matches: boolean;
      messages: boolean;
      spaces: boolean;
      safety: boolean;
      listings: boolean;
    }>(
      "SELECT matches, messages, spaces, safety, listings FROM notification_prefs WHERE user_id = $1",
      [userId],
    );

    const subscription = await queryOne<{ plan: "basic" | "premium"; since: Date }>(
      "SELECT plan, since FROM subscriptions WHERE user_id = $1",
      [userId],
    );

    const plan = subscription?.plan ?? "basic";
    return {
      account: {
        email: account.email,
        phone: account.phone ?? "",
        language: account.language,
        emailVerified: account.email_verified,
        phoneVerified: account.phone_verified,
      },
      notifications: {
        matches: notifications?.matches ?? true,
        messages: notifications?.messages ?? true,
        spaces: notifications?.spaces ?? true,
        safety: notifications?.safety ?? true,
        // Новое поле: старые клиенты его просто игнорируют.
        listings: notifications?.listings ?? true,
      },
      subscription: {
        plan,
        planName: plan === "premium" ? "Премиум" : "Базовый",
        priceLabel: plan === "premium" ? "499 ₽ / мес" : "Бесплатно",
        since: (subscription?.since ?? new Date()).toISOString(),
        premiumFeatures: PREMIUM_FEATURES,
      },
    };
  }

  app.get("/", async (request) => loadBundle(currentUserId(request)));

  app.patch("/account", async (request) => {
    const userId = currentUserId(request);
    const patch = z
      .object({
        email: z.string().email().max(254).optional(),
        phone: z.string().max(32).optional(),
        language: z.enum(["ru", "en"]).optional(),
      })
      .parse(request.body);

    if (patch.email) {
      const taken = await queryOne("SELECT 1 FROM users WHERE email = $1 AND id <> $2", [
        patch.email,
        userId,
      ]);
      if (taken) throw badRequest("Этот email уже используется");
    }

    await query(
      `UPDATE users SET
         email = COALESCE($2, email),
         -- при смене email подтверждение сбрасывается
         email_verified = CASE WHEN $2 IS NULL THEN email_verified ELSE false END,
         phone = COALESCE($3, phone),
         phone_verified = CASE WHEN $3 IS NULL THEN phone_verified ELSE false END,
         language = COALESCE($4, language),
         updated_at = now()
       WHERE id = $1`,
      [userId, patch.email ?? null, patch.phone ?? null, patch.language ?? null],
    );

    return (await loadBundle(userId)).account;
  });

  app.patch("/notifications", async (request) => {
    const userId = currentUserId(request);
    const patch = z
      .object({
        matches: z.boolean().optional(),
        messages: z.boolean().optional(),
        spaces: z.boolean().optional(),
        safety: z.boolean().optional(),
        listings: z.boolean().optional(),
      })
      .parse(request.body);

    await query(
      `UPDATE notification_prefs SET
         matches  = COALESCE($2, matches),
         messages = COALESCE($3, messages),
         spaces   = COALESCE($4, spaces),
         safety   = COALESCE($5, safety),
         listings = COALESCE($6, listings)
       WHERE user_id = $1`,
      [
        userId,
        patch.matches ?? null,
        patch.messages ?? null,
        patch.spaces ?? null,
        patch.safety ?? null,
        patch.listings ?? null,
      ],
    );

    return (await loadBundle(userId)).notifications;
  });

  app.post(
    "/password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      const userId = currentUserId(request);
      const body = z
        .object({ current: z.string().min(1).max(200), next: z.string().min(10).max(200) })
        .parse(request.body);

      if (!isStrongEnough(body.next)) {
        throw badRequest("Новый пароль слишком простой: минимум 10 знаков, буквы и цифры");
      }

      const account = await queryOne<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId],
      );
      if (!account) throw notFound("Аккаунт не найден");
      if (!(await verifyPassword(account.password_hash, body.current))) {
        throw unauthorized("Текущий пароль неверный");
      }

      await query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [
        userId,
        await hashPassword(body.next),
      ]);
      // Смена пароля разлогинивает все остальные устройства.
      await revokeAllForUser(userId);

      return { ok: true as const };
    },
  );

  app.delete("/account", async (request) => {
    const userId = currentUserId(request);
    const body = z
      .object({
        reason: z
          .enum(["found-someone", "too-few-matches", "privacy", "break", "other"])
          .optional(),
        comment: z.string().max(1000).optional(),
      })
      .parse(request.body ?? {});

    const restoreUntil = new Date(Date.now() + env.ACCOUNT_RESTORE_DAYS * 24 * 60 * 60 * 1000);

    // Мягкое удаление: данные ещё можно вернуть, но профиль сразу исчезает
    // из подборок и поиска. Полная очистка — задачей по расписанию.
    await query("UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1", [userId]);
    await query("UPDATE privacy_settings SET visible_in_feed = false WHERE user_id = $1", [userId]);
    await revokeAllForUser(userId);

    const row = await queryOne<{ id: string }>(
      `INSERT INTO deletion_requests (user_id, reason, comment, restore_until)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, body.reason ?? null, body.comment ?? null, restoreUntil],
    );

    return { id: row?.id ?? userId, restoreDays: env.ACCOUNT_RESTORE_DAYS };
  });
}
