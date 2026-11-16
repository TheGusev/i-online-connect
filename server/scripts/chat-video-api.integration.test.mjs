import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const target = new URL(process.env.DATABASE_URL || "postgres://invalid/");
const expectedPort = process.env.GITHUB_ACTIONS === "true" ? "5432" : "55439";
if (process.env.NODE_ENV !== "test" ||
    target.hostname !== "127.0.0.1" || target.port !== expectedPort ||
    !/^\/video_api_[a-z0-9_]+$/.test(target.pathname)) {
  throw new Error("Requires isolated video_api_* database on the approved local test port");
}
const root = await mkdtemp(path.join(os.tmpdir(), "ya-video-api-"));
process.env.MEDIA_DIR = path.join(root, "media");
process.env.MEDIA_BASE_URL = "/api/media-file";
await mkdir(process.env.MEDIA_DIR);
const { query, queryOne, pool } = await import("../src/db.ts");
const { signAccessToken } = await import("../src/auth/tokens.ts");
const { registerPrivateMediaGuard } = await import("../src/media/private-guard.ts");
const { registerErrorHandler } = await import("../src/http.ts");
const { chatRoutes } = await import("../src/routes/chat.ts");
const { spaceRoutes } = await import("../src/routes/spaces.ts");
const { runVideoTool } = await import("../src/media/chat-video.ts");
const app = (await import("fastify")).default();
registerErrorHandler(app);
await app.register((await import("@fastify/cookie")).default);
registerPrivateMediaGuard(app);
await app.register((await import("@fastify/multipart")).default);
await app.register(chatRoutes, { prefix: "/api/chat" });
await app.register(spaceRoutes, { prefix: "/api/spaces" });

async function user(verified = true) {
  const id = randomUUID();
  await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",
    [id, `${id}@video.test`]);
  await query("INSERT INTO profiles(user_id,name,city,age) VALUES($1,'Видео','Город',25)", [id]);
  if (verified) await query(
    "INSERT INTO verifications(user_id,status,selfie_path,reference_url) VALUES($1,'verified','test','test')", [id]);
  return { id, token: await signAccessToken(id) };
}
const auth = who => who ? { authorization: `Bearer ${who.token}` } : {};
function send(scope, who, bytes, ext, temp = randomUUID()) {
  const boundary = "video" + randomUUID();
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="clientTempId"\r\n\r\n${temp}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.${ext}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({ method: "POST", url: scope.url + "/media",
    headers: { ...auth(who), "content-type": `multipart/form-data; boundary=${boundary}` }, payload });
}
const get = (url, who) => app.inject({ method: "GET", url, headers: auth(who) });

try {
  await test("video API and private posters", async t => {
    const me = await user(), peer = await user(), outsider = await user();
    const unverified = await user(false);
    const conv = await queryOne("INSERT INTO conversations DEFAULT VALUES RETURNING id");
    await query(
      "INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3),($1,$4)",
      [conv.id, me.id, peer.id, unverified.id]);
    const space = await queryOne(
      "INSERT INTO spaces(title,host_id,category) VALUES('Видео',$1,'city') RETURNING id", [me.id]);
    await query(
      "INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member'),($1,$4,'member')",
      [space.id, me.id, peer.id, unverified.id]);
    const scopes = [
      { url: `/api/chat/conversations/${conv.id}`, table: "messages" },
      { url: `/api/spaces/${space.id}`, table: "space_messages" },
    ];
    for (const ext of ["mov", "avi"]) {
      const file = path.join(root, `fixture.${ext}`);
      await runVideoTool(process.env.FFMPEG_PATH || "ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=10",
        "-t", "1", "-an", "-c:v", ext === "avi" ? "mpeg4" : "libx264",
        "-threads", "1", file,
      ], 15000);
      const bytes = await readFile(file);
      for (const scope of scopes) {
        await t.test(`${scope.table}: ${ext}, retry and poster authorization`, async () => {
          assert.equal((await send(scope, null, bytes, ext)).statusCode, 401);
          assert.equal((await send(scope, outsider, bytes, ext)).statusCode, 403);
          assert.equal((await send(scope, unverified, bytes, ext)).statusCode, 403);
          const temp = randomUUID();
          const response = await send(scope, me, bytes, ext, temp);
          assert.equal(response.statusCode, 200, response.body);
          const msg = response.json();
          assert.equal(msg.kind, "video");
          assert.equal(msg.mediaMime, "video/mp4");
          assert.ok(msg.durationMs >= 900 && msg.durationMs < 2000);
          assert.match(msg.mediaUrl, /\.mp4$/);
          const dir = path.join(process.env.MEDIA_DIR, "chat", me.id);
          const beforeRetry = (await readdir(dir)).sort();
          const retry = await send(scope, me, bytes, ext, temp);
          assert.equal(retry.statusCode, 200, retry.body);
          assert.equal(retry.json().id, msg.id);
          assert.deepEqual((await readdir(dir)).sort(), beforeRetry);
          const name = path.basename(msg.mediaUrl).replace(/\.mp4$/, ".jpg");
          const poster = `/api/chat-video-poster/${me.id}/${name}`;
          assert.equal((await get(poster, null)).statusCode, 401);
          assert.equal((await get(poster, outsider)).statusCode, 403);
          const preview = await get(poster, peer);
          assert.equal(preview.statusCode, 200, preview.body);
          assert.match(preview.headers["content-type"], /^image\/jpeg/);
          assert.equal(preview.headers["cache-control"], "private, no-store");
          assert.equal(preview.rawPayload[0], 0xff);
          assert.equal(preview.rawPayload[1], 0xd8);
          const rawPoster = msg.mediaUrl.replace(/\.mp4$/, ".jpg");
          assert.equal((await get(rawPoster, peer)).statusCode, 403);
          const deleted = await app.inject({ method: "DELETE",
            url: scope.url + "/messages/" + msg.id, headers: auth(me) });
          assert.equal(deleted.statusCode, 200, deleted.body);
          assert.equal((await get(poster, peer)).statusCode, 403);
          await assert.rejects(
            stat(path.join(dir, path.basename(msg.mediaUrl))),
            error => error.code === "ENOENT");
          await assert.rejects(
            stat(path.join(dir, name)),
            error => error.code === "ENOENT");
        });
      }
    }
  });
} finally {
  await app.close();
  await pool.end();
  await rm(root, { recursive: true, force: true });
}
