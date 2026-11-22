import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, stat, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

if (process.env.NODE_ENV !== "test") throw new Error("NODE_ENV=test required");
const root = await mkdtemp(path.join(tmpdir(), "ya-video-test-"));
process.env.MEDIA_DIR = root;
process.env.MEDIA_BASE_URL = "/api/media-file";
const { normalizeChatVideo, runVideoTool } =
  await import("../src/media/chat-video.ts");

const user = randomUUID();
const dir = path.join(root, "chat", user);
await mkdir(dir, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = ffmpeg.includes("/")
  ? path.join(path.dirname(ffmpeg), "ffprobe") : "ffprobe";

async function fixture(ext, audio = true, seconds = 1.2) {
  const file = path.join(dir, `${randomUUID()}.${ext}`);
  const webm = ext === "webm";
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
    "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=10",
  ];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000");
  args.push("-t", String(seconds), "-threads", "1",
    "-c:v", webm ? "libvpx-vp9" : ext === "avi" || ext === "3gp" ? "mpeg4" : "libx264");
  if (!webm && ext !== "avi" && ext !== "3gp") args.push("-preset", "ultrafast");
  if (audio) args.push("-c:a", webm ? "libopus" : "aac");
  args.push(file);
  await runVideoTool(ffmpeg, args, 30000);
  return file;
}

async function inspect(file) {
  return JSON.parse(await runVideoTool(ffprobe, [
    "-v", "error", "-show_streams", "-of", "json", file,
  ], 15000));
}

try {
  await test("isolated chat video processing", async (t) => {
    for (const ext of ["mp4", "mov", "webm", "mkv", "avi", "3gp"]) {
      await t.test(`${ext} becomes playable MP4 with JPEG poster`, async () => {
        const source = await fixture(ext);
        const result = await normalizeChatVideo(source);
        assert.equal(result.mime, "video/mp4");
        assert.ok(result.durationMs >= 1000 && result.durationMs < 3000);
        assert.ok(result.width > 0 && result.height > 0);
        assert.ok(result.url.endsWith(".mp4"));
        assert.ok(result.posterUrl.endsWith(".jpg"));
        assert.ok((await stat(result.posterPath)).size > 0);
        assert.ok((await stat(source)).size > 0, "source remains intact");
        const info = await inspect(result.filePath);
        assert.equal(info.streams.find(s => s.codec_type === "video")?.codec_name, "h264");
        assert.equal(info.streams.find(s => s.codec_type === "audio")?.codec_name, "aac");
        const poster = await inspect(result.posterPath);
        assert.equal(poster.streams[0]?.codec_name, "mjpeg");
      });
    }
    await t.test("silent video works without an audio stream", async () => {
      const result = await normalizeChatVideo(await fixture("mp4", false));
      const info = await inspect(result.filePath);
      assert.ok(!info.streams.some(s => s.codec_type === "audio"));
    });
    await t.test("corrupt input is rejected without output leftovers", async () => {
      const file = path.join(dir, `${randomUUID()}.avi`);
      await writeFile(file, Buffer.alloc(1024, 42));
      const before = (await readdir(dir)).sort();
      await assert.rejects(normalizeChatVideo(file));
      assert.deepEqual((await readdir(dir)).sort(), before);
    });
    await t.test("video over 61 seconds is rejected", async () => {
      const file = await fixture("mp4", false, 62);
      const before = (await readdir(dir)).sort();
      await assert.rejects(normalizeChatVideo(file), /exceeds 60 seconds/);
      assert.deepEqual((await readdir(dir)).sort(), before);
    });
    await t.test("tool timeout terminates the child process", async () => {
      await assert.rejects(runVideoTool(process.execPath, [
        "-e", "setTimeout(() => {}, 10000)",
      ], 100), /timeout/i);
    });
  });
} finally {
  await rm(root, { recursive: true, force: true });
}
