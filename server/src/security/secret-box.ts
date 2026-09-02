/**
 * Шифрование секретов приложения (сейчас — TOTP-секреты администраторов).
 *
 * AES-256-GCM: даёт и конфиденциальность, и защиту от подмены (тег).
 * Ключ берётся ТОЛЬКО из окружения (TOTP_ENCRYPTION_KEY) и не логируется.
 * Формат хранения: v1:<iv>:<tag>:<ciphertext>, все части base64url.
 *
 * Дамп базы без ключа бесполезен: секрет из него не восстановить.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function keyFrom(secret: string): Buffer {
  if (secret.length < 32) {
    throw new Error("TOTP_ENCRYPTION_KEY: минимум 32 символа");
  }
  // Хеш нужен, чтобы из строки любой длины получить ровно 32 байта ключа.
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(plain: string, keySource: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keySource), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

export function decryptSecret(stored: string, keySource: string): string {
  const [prefix, iv, tag, data] = stored.split(":");
  if (prefix !== PREFIX || !iv || !tag || !data) {
    throw new Error("Формат зашифрованного секрета не распознан");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFrom(keySource),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
