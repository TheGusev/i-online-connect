/**
 * JWT access-токен + refresh-токен в БД.
 *
 * Access живёт минуты и проверяется подписью (без обращения к БД).
 * Refresh — случайная строка; в БД лежит только её SHA-256 хеш,
 * поэтому утечка дампа не даёт войти. Любой refresh можно отозвать.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

import { query, queryOne } from "../db.ts";
import type pg from "pg";
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

/**
 * Ротация refresh с льготным периодом 60 секунд: старый токен помечается
 * rotated_at и ещё минуту принимается (параллельные запросы после сна/смены
 * сети). Отозванные (revoked_at) не принимаются никогда.
 */
export async function rotateRefreshToken(
  token: string,
  meta: { userAgent?: string | undefined; ip?: string | undefined } = {},
): Promise<{ userId: string; next: string }> {
  const row = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
        AND (rotated_at IS NULL OR rotated_at > now() - interval '60 seconds')`,
    [sha256(token)],
  );
  if (!row) throw unauthorized("Сессия недействительна");

  await query(
    "UPDATE refresh_tokens SET rotated_at = now() WHERE id = $1 AND rotated_at IS NULL",
    [row.id],
  );
  const next = await issueRefreshToken(row.user_id, meta);
  return { userId: row.user_id, next };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [sha256(token)],
  );
}

/** Разлогинить пользователя на всех устройствах (смена пароля, удаление). */
export async function revokeAllForUser(userId: string, client?: pg.PoolClient): Promise<void> {
  const sql = "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL";
  if (client) { await client.query(sql, [userId]); return; }
  await query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}

/**
 * Ключ для rate limit: id владельца токена вместо IP.
 *
 * Подпись HS256, издатель и срок проверяются синхронно (node:crypto): rate limit
 * работает в onRequest, до авторизации. Токен без валидной подписи считается
 * по IP, иначе подменой sub можно обнулить счётчик или выбить чужой аккаунт в 429.
 */
export function rateLimitSubject(authorization: string | undefined, ip: string): string {
  const byIp = `ip:${ip}`;
  if (!authorization?.startsWith("Bearer ")) return byIp;
  try {
    const parts = authorization.slice("Bearer ".length).trim().split(".");
    if (parts.length !== 3) return byIp;
    const [h, p, s] = parts as [string, string, string];
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return byIp;
    const expected = createHmac("sha256", accessKey).update(`${h}.${p}`).digest();
    const given = Buffer.from(s, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return byIp;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as { sub?: string; iss?: string; exp?: number };
    if (claims.iss !== "ya-online" || !claims.sub) return byIp;
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return byIp;
    return `user:${claims.sub}`;
  } catch {
    return byIp;
  }
}
