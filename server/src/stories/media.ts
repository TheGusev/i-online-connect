import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "../env.ts";
import { badRequest } from "../http.ts";
import { detectMediaType } from "../media/store.ts";
import { probeChatVideo, runVideoTool, videoInputOptions } from "../media/chat-video.ts";

export const storyDirectory = () => `${path.resolve(env.MEDIA_DIR)}-stories`;

export function storyPath(key: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|mp4)$/.test(key)) throw badRequest("Некорректный файл истории");
  return path.join(storyDirectory(), key);
}

export async function removeStoryFile(key: string) {
  try { await unlink(storyPath(key)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function storyFiles() {
  try { return await readdir(storyDirectory()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function prepareStoryMedia(buffer: Buffer) {
  const type = detectMediaType(buffer);
  if (!type || !["photo", "video"].includes(type.kind)) {
    throw badRequest("Выберите фото JPEG, PNG, WebP или видео MP4/MOV/WebM");
  }
  const image = type.kind === "photo";
  if (!buffer.length || buffer.length > (image ? 10 : 40) * 1024 * 1024) {
    throw badRequest(image ? "Фото — до 10 МБ" : "Видео — до 40 МБ");
  }

  const temporary = await mkdtemp(path.join(os.tmpdir(), "ya-story-"));
  const input = path.join(temporary, `input.${type.ext}`);
  const output = path.join(temporary, image ? "output.jpg" : "output.mp4");
  const key = `${randomUUID()}.${image ? "jpg" : "mp4"}`;
  let copied = false;
  try {
    await writeFile(input, buffer, { mode: 0o600 });
    let durationMs: number | null = null;
    const scale = "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";

    if (image) {
      await runVideoTool(env.FFMPEG_PATH, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-filter_threads", "1", "-threads", "1",
        "-protocol_whitelist", "file",
        "-f", "image2", "-pattern_type", "none",
        "-max_pixels", "33554432", "-i", input,
        "-map", "0:v:0", "-frames:v", "1",
        "-map_metadata", "-1", "-vf", scale,
        "-q:v", "3", "-threads", "1", output,
      ], 20000);
    } else {
      const before = await probeChatVideo(input);
      if (before.durationMs === undefined ||
          before.durationMs < 200 || before.durationMs > 30000) {
        throw badRequest("Видео должно быть от 0,2 до 30 секунд");
      }
      await runVideoTool(env.FFMPEG_PATH, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-filter_threads", "1", ...videoInputOptions,
        "-threads", "1", "-max_pixels", "33554432", "-i", input,
        "-map", "0:V:0", "-map", "0:a:0?",
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-vf", scale, "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-threads", "1",
        "-maxrate", "3M", "-bufsize", "6M",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart", "-fs", "47185920", output,
      ], 60000);
      const after = await probeChatVideo(output);
      durationMs = after.durationMs ?? null;
      if (durationMs === null || durationMs < 200 || durationMs > 30000) {
        throw badRequest("Не удалось подтвердить длительность видео до 30 секунд");
      }
    }

    const size = (await stat(output)).size;
    if (size <= 0 || size >= 45 * 1024 * 1024) {
      throw badRequest("Обработанный файл слишком большой или пустой");
    }
    await mkdir(storyDirectory(), { recursive: true, mode: 0o700 });
    await copyFile(output, storyPath(key), constants.COPYFILE_EXCL);
    copied = true;
    await chmod(storyPath(key), 0o600);
    return {
      key, kind: image ? "image" as const : "video" as const,
      mime: image ? "image/jpeg" : "video/mp4", size, durationMs,
    };
  } catch (error) {
    if (copied) await removeStoryFile(key);
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
