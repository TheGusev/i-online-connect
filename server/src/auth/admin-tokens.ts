/**
 * Отдельная сессия администратора.
 *
 * Почему не обычный access-токен: у пользовательского токена срок 15 минут с
 * бесконечным обновлением через refresh — угнанный refresh даёт доступ месяц.
 * Админский токен подписан ДРУГИМ ключом (JWT_ADMIN_SECRET), живёт
 * ADMIN_SESSION_TTL (по умолчанию 2 часа) и не обновляется: истёк — только
 * повторный вход с паролем и кодом из приложения.
 *
 * Передаётся в заголовке x-admin-token, а не в Authorization: обычный
 * пользовательский токен физически не может открыть админку, и наоборот.
 */
import { SignJWT, jwtVerify } from "jose";

import { env } from "../env.ts";
import { forbidden } from "../http.ts";

const ISSUER = "ya-online-admin";
const AUDIENCE = "admin-panel";

function adminKey(): Uint8Array {
  if (!env.adminLoginEnabled) {
    // Пока секреты не заданы, админка недоступна — так и отвечаем,
    // ничего не подписывая случайным ключом.
    throw forbidden("Нет доступа");
  }
  return new TextEncoder().encode(env.JWT_ADMIN_SECRET);
}

/** Токен выдаётся только после пароля + TOTP (см. routes/admin-session.ts). */
export async function signAdminToken(userId: string): Promise<string> {
  return new SignJWT({ scope: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(env.ADMIN_SESSION_TTL)
    .sign(adminKey());
}

export async function verifyAdminToken(token: string): Promise<{ sub: string }> {
  try {
    const { payload } = await jwtVerify(token, adminKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub || payload["scope"] !== "admin") throw new Error("scope");
    return { sub: payload.sub };
  } catch {
    // Причину не уточняем: истёк, подделан или не тот ключ — ответ один.
    throw forbidden("Нет доступа");
  }
}

/** Срок жизни в секундах — фронтенду, чтобы показать таймер сессии. */
export function adminSessionSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(env.ADMIN_SESSION_TTL);
  if (!match) return 2 * 60 * 60;
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}
