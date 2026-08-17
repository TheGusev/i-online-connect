/**
 * JWT access-токен + refresh-токен в БД.
 *
 * Access живёт минуты и проверяется подписью (без обращения к БД).
 * Refresh — случайная строка; в БД лежит только её SHA-256 хеш,
 * поэтому утечка дампа не даёт войти. Любой refresh можно отозвать.
 */
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { unauthorized } from "../http.ts";

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessClaims {
  sub: string;
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer("ya-online")
    .setExpirationTime(env.ACCESS_TTL)
    .sign(accessKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, accessKey, { issuer: "ya-online" });
    if (!payload.sub) throw unauthorized("Токен без владельца");
    return { sub: payload.sub };
  } catch {
    throw unauthorized("Сессия истекла, войдите снова");
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string | undefined; ip?: string | undefined } = {},
): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, sha256(token), meta.userAgent ?? null, meta.ip ?? null, expiresAt],
  );
  return token;
}

/** Проверка refresh с одноразовым использованием (rotation). */
export async function rotateRefreshToken(token: string): Promise<{ userId: string; next: string }> {
  const row = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sha256(token)],
  );
  if (!row) throw unauthorized("Сессия недействительна");

  await query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
  const next = await issueRefreshToken(row.user_id);
  return { userId: row.user_id, next };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [sha256(token)],
  );
}

/** Разлогинить пользователя на всех устройствах (смена пароля, удаление). */
export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}
