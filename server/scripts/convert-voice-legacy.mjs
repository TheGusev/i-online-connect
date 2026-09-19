/**
 * Перекодирует ранее отправленные голосовые в AAC/M4A.
 *
 * Старые записи с Android лежат в WebM/Opus — Safari/iOS такой контейнер не
 * воспроизводит вовсе. Скрипт проходит по сообщениям с media_mime = audio/webm,
 * переводит файл в .m4a рядом, обновляет ссылку и mime в базе и удаляет
 * оригинал. Новые голосовые сервер конвертирует сам при отправке.
 *
 * Запуск: npm run voice:convert
 */
import path from "node:path";
import process from "node:process";
import { readFile, unlink, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  const raw = await readFile(path.join(here, "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* .env может отсутствовать */
}

const DATABASE_URL = process.env.DATABASE_URL;
const MEDIA_DIR = process.env.MEDIA_DIR;
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

if (!DATABASE_URL || !MEDIA_DIR) {
  console.error("[voice:convert] нужны DATABASE_URL и MEDIA_DIR");
  process.exit(1);
}

/** Локальный путь файла по публичной ссылке вида .../voice/<userId>/<name>. */
function localPath(url) {
  const match = /\/voice\/([^/]+)\/([^/?#]+)$/.exec(url);
  if (!match) return null;
  return { dir: path.join(MEDIA_DIR, "voice", match[1]), name: match[2], userId: match[1] };
}

function transcode(input, output) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      FFMPEG_PATH,
      ["-y", "-i", input, "-vn", "-c:a", "aac", "-b:a", "64k", "-ar", "44100", "-ac", "1",
       "-movflags", "+faststart", output],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

let converted = 0;
let skipped = 0;

try {
  const { rows } = await client.query(
    "SELECT id, media_url FROM messages WHERE kind = 'voice' AND media_mime = 'audio/webm' AND deleted_at IS NULL",
  );
  console.log(`[voice:convert] записей к конвертации: ${rows.length}`);

  for (const row of rows) {
    const file = localPath(row.media_url ?? "");
    if (!file) {
      skipped += 1;
      continue;
    }
    const input = path.join(file.dir, file.name);
    try {
      await access(input);
    } catch {
      skipped += 1;
      continue;
    }
    const outName = `${randomUUID()}.m4a`;
    const output = path.join(file.dir, outName);
    try {
      await transcode(input, output);
      const newUrl = row.media_url.replace(/[^/]+$/, outName);
      await client.query("UPDATE messages SET media_url = $1, media_mime = 'audio/mp4' WHERE id = $2", [
        newUrl,
        row.id,
      ]);
      await unlink(input).catch(() => undefined);
      converted += 1;
    } catch (cause) {
      await unlink(output).catch(() => undefined);
      skipped += 1;
      console.warn(`[voice:convert] пропуск ${row.id}:`, cause instanceof Error ? cause.message : cause);
    }
  }

  console.log(`[voice:convert] готово: конвертировано ${converted}, пропущено ${skipped}`);
} catch (cause) {
  console.error("[voice:convert] ошибка:", cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  await client.end();
}
