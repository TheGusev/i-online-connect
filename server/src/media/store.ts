/**
 * Приём файлов от пользователя: проверка типа по магическим байтам,
 * запись на диск и публичный URL.
 *
 * Расширению из имени файла не верим: клиент может назвать exe как jpg.
 * Тип определяем по подписи в первых байтах — это единственный надёжный способ.
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.ts";
import { badRequest } from "../http.ts";

export interface DetectedType {
  kind: "photo" | "video" | "audio";
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

/** Сколько фото и видео помещается в один профиль. */
export const MAX_PROFILE_PHOTOS = 5;
export const MAX_PROFILE_VIDEOS = 1;

/** Проверка размера под тип файла: у фото и видео разные лимиты. */
export function assertSize(type: DetectedType, size: number) {
  const limit = type.kind === "photo" ? MAX_PHOTO_BYTES : type.kind === "audio" ? MAX_VOICE_BYTES : MAX_VIDEO_BYTES;
  if (size > limit) {
    throw badRequest(
      type.kind === "photo"
        ? "фото больше 8 МБ — выберите файл меньше"
        : type.kind === "audio"
          ? "голосовое сообщение больше 10 МБ — запишите коротче"
          : "видео больше 40 МБ — запишите короче или снизьте качество",
    );
  }
}

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;

export interface DetectedAudioType {
  mime: "audio/webm" | "audio/mp4";
  ext: "webm" | "m4a";
}

/** Голосовые браузера: WebM/Opus в Chromium, MP4/AAC в Safari. */
export function detectAudioType(buffer: Buffer): DetectedAudioType | null {
  if (buffer.length < 16) return null;
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mime: "audio/webm", ext: "webm" };
  }
  if (ascii(buffer, 4, 4) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  return null;
}

export async function saveVoiceFile(userId: string, buffer: Buffer, type: DetectedAudioType) {
  const dir = path.join(env.MEDIA_DIR, "voice", userId);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const name = `${randomUUID()}.${type.ext}`;
  const filePath = path.join(dir, name);
  await writeFile(filePath, buffer, { mode: 0o644 });
  const base = env.MEDIA_BASE_URL.replace(/\/$/, "");
  return { filePath, url: `${base}/voice/${userId}/${name}` };
}

function hmsToMs(hours: string, minutes: string, seconds: string) {
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000);
}

/**
 * Проверяем фактическую длительность через установленный ffmpeg, а не доверяем клиенту.
 * Заголовок потоковой записи (MediaRecorder: WebM без длительности, фрагментированный
 * MP4 на iOS) часто не содержит `Duration`, поэтому дополнительно берём последнее
 * `time=` из прогресса декодирования — это длительность реально декодированного звука.
 */
export function audioDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const process = spawn(env.FFMPEG_PATH, ["-hide_banner", "-i", filePath, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      process.kill("SIGKILL");
      reject(new Error("audio duration timeout"));
    }, 10_000);
    process.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    process.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.on("close", () => {
      clearTimeout(timer);
      const header = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      const headerMs = header ? hmsToMs(header[1]!, header[2]!, header[3]!) : 0;
      let decodedMs = 0;
      for (const match of stderr.matchAll(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g)) {
        decodedMs = Math.max(decodedMs, hmsToMs(match[1]!, match[2]!, match[3]!));
      }
      const durationMs = Math.max(headerMs, decodedMs);
      if (durationMs <= 0) {
        reject(new Error("audio duration unavailable"));
        return;
      }
      resolve(durationMs);
    });
  });
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

/** Сколько фото можно приложить к одному объявлению. */
export const MAX_LISTING_PHOTOS = 6;

/**
 * Запись фото объявления. Лежит в отдельной папке listings/<userId>/,
 * чтобы снимки из «Рядом» никогда не попадали в галерею профиля.
 */
export async function saveListingFile(userId: string, buffer: Buffer, type: DetectedType) {
  const dir = path.join(env.MEDIA_DIR, "listings", userId);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const name = `${randomUUID()}.${type.ext}`;
  const filePath = path.join(dir, name);
  await writeFile(filePath, buffer, { mode: 0o644 });
  const base = env.MEDIA_BASE_URL.replace(/\/$/, "");
  return { filePath, url: `${base}/listings/${userId}/${name}` };
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
  // Учитываем и текущий MEDIA_BASE_URL, и исторические префиксы: старые записи
  // в базе хранят ссылки, выданные до смены настройки.
  const bases = [env.MEDIA_BASE_URL, "/media", "/api/media-file"].map((base) =>
    base.replace(/\/$/, ""),
  );
  const pathname = url.startsWith("/") ? url : new URL(url, "http://localhost").pathname;
  const base = bases.find((candidate) => pathname.startsWith(`${candidate}/`));
  if (!base) return null;
  const relative = pathname.slice(base.length + 1);
  // Защита от «../»: путь должен остаться внутри MEDIA_DIR.
  const resolved = path.resolve(env.MEDIA_DIR, relative);
  return resolved.startsWith(path.resolve(env.MEDIA_DIR)) ? resolved : null;
}

/**
 * Перекодирует голосовое сообщение в AAC/M4A через ffmpeg.
 *
 * WebM/Opus, который пишет MediaRecorder в Chrome/Android, не воспроизводится
 * в Safari/iOS ни через <audio>, ни через AudioContext.decodeAudioData —
 * WebKit не поддерживает контейнер WebM вовсе. AAC/M4A играет одинаково на
 * iOS и Android, поэтому после сохранения оригинала перекодируем в него и
 * раздаём только результат — независимо от того, чем записал отправитель.
 */
export async function transcodeVoiceToAac(
  inputPath: string,
  userId: string,
): Promise<{ filePath: string; url: string }> {
  const dir = path.dirname(inputPath);
  const outName = `${randomUUID()}.m4a`;
  const outPath = path.join(dir, outName);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      env.FFMPEG_PATH,
      ["-y", "-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "64k", "-ar", "44100", outPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("voice transcode timeout"));
    }, 20_000);
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg transcode exit ${code}: ${stderr.slice(-400)}`));
        return;
      }
      resolve();
    });
  });
  const base = env.MEDIA_BASE_URL.replace(/\/$/, "");
  return { filePath: outPath, url: `${base}/voice/${userId}/${outName}` };
}
