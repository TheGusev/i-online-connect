/**
 * Нарезка кадров из видео-селфи через ffmpeg.
 *
 * ffmpeg должен быть установлен на сервере (apt install ffmpeg).
 * Работаем через stdout: временные файлы не создаём.
 */
import { spawn } from "node:child_process";

import { env } from "../env.ts";

function run(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      const output = Buffer.concat(chunks);
      if (output.length > 0) resolve(output);
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderr.slice(-400)}`));
    });
  });
}

/** Длительность видео в секундах (0, если определить не удалось). */
export async function videoDuration(filePath: string): Promise<number> {
  try {
    // ffmpeg пишет длительность в stderr; используем его же, чтобы не требовать ffprobe.
    const args = ["-hide_banner", "-i", filePath, "-f", "null", "-"];
    await run(args).catch(() => Buffer.alloc(0));
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Три кадра: начало, середина, конец. Каждый — JPEG шириной 640 px.
 * Если видео короче, ffmpeg вернёт последний доступный кадр.
 */
export async function extractFrames(
  filePath: string,
  offsets: number[] = [0.4, 2, 4],
): Promise<Buffer[]> {
  const frames: Buffer[] = [];
  for (const offset of offsets) {
    try {
      const frame = await run([
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(offset),
        "-i",
        filePath,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        "-f",
        "image2",
        "pipe:1",
      ]);
      if (frame.length > 0) frames.push(frame);
    } catch {
      // Кадр за пределами видео — просто пропускаем.
    }
  }
  return frames;
}
