/**
 * Приём файлов от пользователя: проверка типа по магическим байтам,
 * запись на диск и публичный URL.
 *
 * Расширению из имени файла не верим: клиент может назвать exe как jpg.
 * Тип определяем по подписи в первых байтах — это единственный надёжный способ.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.ts";
import { badRequest } from "../http.ts";

export interface DetectedType {
  kind: "photo" | "video";
  mime: string;
  ext: string;
}

const ascii = (buffer: Buffer, start: number, length: number) =>
  buffer.subarray(start, start + length).toString("latin1");

/** Определение типа по подписи файла. null — формат не поддерживаем. */
export function detectMediaType(buffer: Buffer): DetectedType | null {
  if (buffer.length < 16) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: "photo", mime: "image/jpeg", ext: "jpg" };
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && ascii(buffer, 1, 3) === "PNG") {
    return { kind: "photo", mime: "image/png", ext: "png" };
  }
  // WebP: RIFF....WEBP
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WEBP") {
    return { kind: "photo", mime: "image/webp", ext: "webp" };
  }
  // WebM / Matroska: 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { kind: "video", mime: "video/webm", ext: "webm" };
  }
  // MP4 / QuickTime: ....ftyp
  if (ascii(buffer, 4, 4) === "ftyp") {
    return { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  return null;
}

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Проверка размера под тип файла: у фото и видео разные лимиты. */
export function assertSize(type: DetectedType, size: number) {
  const limit = type.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (size > limit) {
    throw badRequest(
      type.kind === "photo"
        ? "Фото больше 8 МБ — выберите файл меньше"
        : "Видео больше 40 МБ — запишите короче или снизьте качество",
    );
  }
}

/** Запись файла профиля. Возвращает путь на диске и публичный URL. */
export async function saveProfileFile(userId: string, buffer: Buffer, type: DetectedType) {
  const dir = path.join(env.MEDIA_DIR, userId);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const name = `${randomUUID()}.${type.ext}`;
  const filePath = path.join(dir, name);
  await writeFile(filePath, buffer, { mode: 0o644 });
  const base = env.MEDIA_BASE_URL.replace(/\/$/, "");
  return { filePath, url: `${base}/${userId}/${name}` };
}

/** Запись приватного файла верификации: наружу не раздаётся никогда. */
export async function savePrivateFile(userId: string, buffer: Buffer, ext: string) {
  const dir = path.join(env.VERIFICATION_DIR, userId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dir, `${randomUUID()}.${ext}`);
  await writeFile(filePath, buffer, { mode: 0o600 });
  return filePath;
}

/** Путь к файлу медиа по публичному URL (для удаления). */
export function mediaPathFromUrl(url: string): string | null {
  const base = env.MEDIA_BASE_URL.replace(/\/$/, "");
  if (!url.startsWith(`${base}/`)) return null;
  const relative = url.slice(base.length + 1);
  // Защита от «../»: путь должен остаться внутри MEDIA_DIR.
  const resolved = path.resolve(env.MEDIA_DIR, relative);
  return resolved.startsWith(path.resolve(env.MEDIA_DIR)) ? resolved : null;
}
