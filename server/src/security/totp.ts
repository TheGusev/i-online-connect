/**
 * TOTP (RFC 6238) для входа администратора — Google Authenticator и аналоги.
 *
 * Правила:
 *  - секрет генерируется только на сервере (CLI grant-admin) и хранится
 *    зашифрованным (см. secret-box.ts);
 *  - окно ±1 шаг (30 секунд) на расхождение часов, не больше;
 *  - код одноразовый: принятый код с его шагом пишется в totp_used_codes,
 *    повторное предъявление отклоняется, даже если 30 секунд ещё не прошли.
 */
import { createHash } from "node:crypto";
import { authenticator } from "otplib";

import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { decryptSecret, encryptSecret } from "./secret-box.ts";

const STEP_SECONDS = 30;

// window: [назад, вперёд] шагов. Один шаг в каждую сторону — компромисс
// между расхождением часов у телефона и размером окна для перебора.
authenticator.options = { step: STEP_SECONDS, window: [1, 1] };

const ISSUER = "Я Онлайн";

export interface TotpBinding {
  /** Base32-секрет — показывается человеку ОДИН раз, в терминале сервера. */
  secret: string;
  /** Ссылка otpauth:// для QR. Тоже только в терминал. */
  uri: string;
  /** Зашифрованное значение для колонки users.totp_secret. */
  encrypted: string;
}

/** Новая привязка. Вызывается только из CLI, не из HTTP-обработчиков. */
export function createTotpBinding(email: string, keySource: string): TotpBinding {
  const secret = authenticator.generateSecret(20);
  return {
    secret,
    uri: authenticator.keyuri(email, ISSUER, secret),
    encrypted: encryptSecret(secret, keySource),
  };
}

const codeHash = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Проверка кода. Возвращает true только если код валиден И не использован.
 * Любая ошибка расшифровки трактуется как отказ: молча пускать нельзя.
 */
export async function verifyTotpCode(
  userId: string,
  storedSecret: string,
  code: string,
): Promise<boolean> {
  let secret: string;
  try {
    secret = decryptSecret(storedSecret, env.TOTP_ENCRYPTION_KEY);
  } catch {
    return false;
  }

  if (!authenticator.check(code, secret)) return false;

  // Шаг фиксируем по текущему времени: код в пределах окна ±1 шаг
  // всё равно нельзя применить дважды — ключ уникален по (user, hash, step).
  const step = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const used = await queryOne(
    `SELECT 1 FROM totp_used_codes
      WHERE user_id = $1 AND code_hash = $2 AND step BETWEEN $3 - 1 AND $3 + 1`,
    [userId, codeHash(code), step],
  );
  if (used) return false;

  await query(
    `INSERT INTO totp_used_codes (user_id, code_hash, step) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, codeHash(code), step],
  );
  // Старые записи не нужны: код за пределами окна и так не пройдёт проверку.
  await query("DELETE FROM totp_used_codes WHERE used_at < now() - interval '10 minutes'");
  return true;
}
