import { detectMediaType, type DetectedType } from "./store.ts";
import { randomUUID } from "node:crypto";
import { stat, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { env } from "../env.ts";

const INPUT_FORMATS = "mov,matroska,webm,avi";

export function runVideoTool(
  binary: string, args: string[], timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"], shell: false,
    });
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("Video processing timeout"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + chunk.length > 512 * 1024) {
        stop("Video metadata output limit exceeded");
      } else stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(
        `Video tool exit ${code}: ${stderr.slice(-1000)}`,
      ));
      else resolve(stdout);
    });
  });
}

export const videoInputOptions = [
  "-protocol_whitelist", "file",
  "-format_whitelist", INPUT_FORMATS,
];

export async function probeChatVideo(filePath: string) {
  const ffprobe = env.FFMPEG_PATH.includes("/")
    ? path.join(path.dirname(env.FFMPEG_PATH), "ffprobe")
    : "ffprobe";
  const text = await runVideoTool(ffprobe, [
    "-v", "error", ...videoInputOptions,
    "-show_entries",
    "format=duration:stream=codec_type,width,height,duration:stream_disposition=attached_pic",
    "-of", "json", "-i", filePath,
  ], 15000);
  const data = JSON.parse(text) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string; width?: number; height?: number;
      duration?: string; disposition?: { attached_pic?: number };
    }>;
  };
  const streams = data.streams ?? [];
  const video = streams.find(s =>
    s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  if (!video) throw new Error("File has no video stream");
  const width = Number(video.width);
  const height = Number(video.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 2 || height < 2 || width > 8192 || height > 8192 ||
      width * height > 33554432) {
    throw new Error("Unsupported video dimensions");
  }
  const durations = [data.format?.duration, ...streams.map(s => s.duration)]
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value > 0);
  const durationMs = durations.length
    ? Math.round(Math.max(...durations) * 1000) : undefined;
  if (durationMs !== undefined && durationMs > 61000) {
    throw new Error("Video exceeds 60 seconds");
  }
  return { width, height, durationMs };
}

const MAX_OUTPUT_BYTES = 45 * 1024 * 1024;
let processingVideo = false;

export async function normalizeChatVideo(inputPath: string) {
  if (processingVideo) {
    throw new Error("Video processor busy; retry shortly");
  }
  processingVideo = true;
  const id = randomUUID();
  const dir = path.dirname(inputPath);
  const filePath = path.join(dir, `${id}.mp4`);
  const posterPath = path.join(dir, `${id}.jpg`);
  const removeOutputs = async () => {
    await Promise.all([filePath, posterPath].map(
      file => unlink(file).catch(() => undefined),
    ));
  };
  try {
    const mediaRoot = path.resolve(env.MEDIA_DIR);
    const relative = path.relative(mediaRoot, path.resolve(inputPath));
    if (relative.startsWith("..") || path.isAbsolute(relative) ||
        !/^chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(relative)) {
      throw new Error("Invalid chat video input path");
    }
    const inputSize = (await stat(inputPath)).size;
    if (inputSize < 512 || inputSize > MAX_OUTPUT_BYTES) {
      throw new Error("Invalid video input size");
    }
    await probeChatVideo(inputPath);

    await runVideoTool(env.FFMPEG_PATH, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
      "-filter_threads", "1",
      ...videoInputOptions,
      "-threads", "1", "-max_pixels", "33554432",
      "-i", inputPath,
      "-map", "0:V:0", "-map", "0:a:0?",
      "-map_metadata", "-1", "-map_chapters", "-1",
      "-vf",
      "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
      "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "24", "-pix_fmt", "yuv420p", "-threads", "1",
      "-maxrate", "3M", "-bufsize", "6M",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2",
      "-movflags", "+faststart",
      "-fs", String(MAX_OUTPUT_BYTES + 1),
      filePath,
    ], 90000);

    const outputSize = (await stat(filePath)).size;
    if (outputSize < 512 || outputSize >= MAX_OUTPUT_BYTES) {
      throw new Error("Invalid normalized video size");
    }
    const output = await probeChatVideo(filePath);
    if (output.durationMs === undefined || output.durationMs < 200) {
      throw new Error("Video duration unavailable after normalization");
    }

    await runVideoTool(env.FFMPEG_PATH, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
      "-filter_threads", "1", ...videoInputOptions,
      "-threads", "1", "-max_pixels", "33554432",
      "-i", filePath, "-map", "0:V:0", "-frames:v", "1",
      "-vf",
      "scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-q:v", "3", "-threads", "1",
      "-update", "1", posterPath,
    ], 15000);
    if ((await stat(posterPath)).size === 0) {
      throw new Error("Empty video poster");
    }

    const base = env.MEDIA_BASE_URL.replace(/\/$/, "");
    const userId = path.basename(dir);
    return {
      filePath, posterPath,
      url: `${base}/chat/${userId}/${id}.mp4`,
      posterUrl: `${base}/chat/${userId}/${id}.jpg`,
      mime: "video/mp4" as const,
      durationMs: output.durationMs,
      width: output.width, height: output.height,
    };
  } catch (error) {
    await removeOutputs();
    throw error;
  } finally {
    processingVideo = false;
  }
}

/** Chat-only input detection; actual video streams are checked by ffprobe. */
export function detectChatMediaType(buffer: Buffer): DetectedType | null {
  const detected = detectMediaType(buffer);
  if (detected) return detected;
  if (buffer.length >= 16 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "AVI ") {
    return { kind: "video", mime: "video/x-msvideo", ext: "avi" };
  }
  return null;
}

/** Remove only recognized chat video paths and their companion poster. */
export async function removeChatVideoFiles(url: string): Promise<void> {
  const pathname = new URL(url, env.PUBLIC_BASE_URL).pathname;
  const configured = new URL(env.MEDIA_BASE_URL, env.PUBLIC_BASE_URL)
    .pathname.replace(/\/$/, "");
  const prefixes = [...new Set([
    configured, "/media", "/uploads", "/api/media-file",
  ])];
  let relative: string | undefined;
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix + "/")) {
      relative = pathname.slice(prefix.length + 1);
      break;
    }
  }
  const match = relative &&
    /^chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(mp4|webm|mov|m4v|mkv|avi|3gp|3g2)$/i.exec(relative);
  if (!match) return;
  const dir = path.join(env.MEDIA_DIR, "chat", match[1]!);
  const names = [`${match[2]}.${match[3]}`];
  if (match[3]!.toLowerCase() === "mp4") names.push(`${match[2]}.jpg`);
  for (const name of names) {
    try { await unlink(path.join(dir, name)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
