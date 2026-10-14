/**
 * Вход по номеру: нормализация, хеш кода, лимиты.
 * Лимиты считаются по таблице auth_otps — работают без Redis и переживают перезапуск.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "../env.ts";
import { queryOne } from "../db.ts";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
/** Пауза между запросами кода на номер: растёт с каждым повтором. */
export const RESEND_STEPS_S = [60, 120, 300];
export const PER_PHONE_HOURLY = 5;
export const PER_IP_HOURLY = 20;

/** Любой ввод («8 (999) 123-45-67», «+7 999…») → E.164 или null. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let e164: string;
  if (digits.length === 11 && digits.startsWith("8")) e164 = `+7${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("9")) e164 = `+7${digits}`;
  else e164 = `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith("+7") && e164.length !== 12) return null;
  if (!env.allowedPhonePrefixes.some((prefix) => e164.startsWith(prefix))) return null;
  return e164;
}

function secret(): string {
  return env.OTP_SECRET || env.JWT_REFRESH_SECRET;
}

export function hashCode(phone: string, code: string): string {
  return createHmac("sha256", secret()).update(`${phone}:${code}`).digest("hex");
}

export function codesMatch(storedHex: string, phone: string, code: string): boolean {
  const a = Buffer.from(storedHex, "hex");
  const b = Buffer.from(hashCode(phone, code), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateCode(phone: string): string {
  const fixed = env.testPhones.get(phone);
  if (fixed) return fixed;
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type LimitResult = { ok: true } | { ok: false; retryAfter: number; message: string };

function wait(seconds: number, message: string): LimitResult {
  return { ok: false, retryAfter: Math.max(1, Math.ceil(seconds)), message };
}

export async function checkRequestLimits(phone: string, ip: string): Promise<LimitResult> {
  const stats = await queryOne<{ hour_count: string; last_at: Date | null; streak: string }>(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour_count,
            max(created_at) AS last_at,
            count(*) FILTER (WHERE created_at > now() - interval '15 minutes') AS streak
       FROM auth_otps WHERE phone = $1`,
    [phone],
  );
  const hourCount = Number(stats?.hour_count ?? 0);
  const streak = Number(stats?.streak ?? 0);
  if (stats?.last_at) {
    const pause = RESEND_STEPS_S[Math.min(Math.max(streak - 1, 0), RESEND_STEPS_S.length - 1)] ?? 60;
    const left = pause - (Date.now() - stats.last_at.getTime()) / 1000;
    if (left > 0) return wait(left, `Новый код можно запросить через ${Math.ceil(left)} с`);
  }
  if (hourCount >= PER_PHONE_HOURLY) {
    return wait(3600, "Слишком много запросов кода на этот номер. Попробуйте через час");
  }
  const byIp = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM auth_otps WHERE ip = $1 AND created_at > now() - interval '1 hour'",
    [ip],
  );
  if (Number(byIp?.n ?? 0) >= PER_IP_HOURLY) {
    return wait(3600, "Слишком много запросов с вашей сети. Попробуйте через час");
  }
  const daily = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM auth_otps WHERE created_at > now() - interval '1 day'",
  );
  if (Number(daily?.n ?? 0) >= env.SMS_DAILY_LIMIT) {
    return wait(3600, "Отправка SMS временно недоступна. Попробуйте позже или войдите по почте");
  }
  return { ok: true };
}
