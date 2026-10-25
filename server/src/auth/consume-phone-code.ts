import { transaction } from "../db.ts";
import { HttpError } from "../http.ts";
import { OTP_MAX_ATTEMPTS, codesMatch } from "./phone.ts";

export async function consumePhoneCode(phone: string, code: string, userId?: string) {
  const error = await transaction(async client => {
    const { rows } = await client.query<{ id: string; code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT id, code_hash, expires_at, attempts FROM auth_otps
       WHERE phone = $1 AND purpose = $2 AND user_id IS NOT DISTINCT FROM $3::uuid AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone, userId ? "link" : "login", userId ?? null],
    );
    const otp = rows[0];
    if (!otp) return new HttpError(400, "Код недействителен — запросите новый", "otp_missing");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return new HttpError(400, "Слишком много попыток — запросите новый код", "otp_attempts");
    if (otp.expires_at.getTime() <= Date.now()) return new HttpError(400, "Срок кода истёк — запросите новый", "otp_expired");
    const valid = codesMatch(otp.code_hash, phone, code);
    await client.query(`UPDATE auth_otps SET attempts = attempts + 1,
      consumed_at = CASE WHEN $2 OR attempts + 1 >= $3 THEN now() ELSE NULL END WHERE id = $1`, [otp.id, valid, OTP_MAX_ATTEMPTS]);
    return valid ? null : new HttpError(400, "Неверный код", "otp_invalid");
  });
  if (error) throw error;
}