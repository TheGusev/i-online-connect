/**
 * Воспроизведение ошибки 400 на голосовых сообщениях.
 * POST /api/chat/conversations/:id/voice с multipart-телом ровно в том виде,
 * в каком его шлёт браузер (sendVoiceMessage в src/api/endpoints/chat.ts):
 * поля clientTempId (UUID), durationMs (миллисекунды строкой), один файл.
 *
 * Запуск (из server/): DATABASE_URL=... node --experimental-strip-types tests/voice.test.mjs
 * Требует ffmpeg в PATH (как и прод: FFMPEG_PATH).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// env читается при импорте модулей сервера — задаём до dynamic import.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgres://postgres@/ya_test?host=/tmp/pgtest&port=5544";
process.env.JWT_ACCESS_SECRET ||= "test-access-secret-key-minimum-32-chars";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-key-minimum-32-chars";
const mediaDir = mkdtempSync(path.join(tmpdir(), "voice-media-"));
process.env.MEDIA_DIR = mediaDir;
process.env.ABUSE_LOG_FILE = path.join(mediaDir, "abuse.log");
process.env.ADMIN_LOG_FILE = path.join(mediaDir, "admin-audit.log");

const { query, queryOne } = await import("../src/db.ts");
const { hashPassword } = await import("../src/auth/passwords.ts");
const { signAccessToken } = await import("../src/auth/tokens.ts");
const { chatRoutes } = await import("../src/routes/chat.ts");
const { registerErrorHandler } = await import("../src/http.ts");
const multipart = (await import("@fastify/multipart")).default;
const rateLimit = (await import("@fastify/rate-limit")).default;
const Fastify = (await import("fastify")).default;

const app = Fastify();
registerErrorHandler(app);
await app.register(multipart, { attachFieldsToBody: false, limits: { fileSize: 40 * 1024 * 1024, files: 1, fields: 5 } });
await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
await app.register(chatRoutes, { prefix: "/api/chat" });

// ── Данные: два пользователя и диалог ────────────────────────────────────────
async function makeUser(email) {
  const hash = await hashPassword("Sup3r-Secret-Pass");
  const u = await queryOne(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [email, hash],
  );
  await query(
    `INSERT INTO profiles (user_id, name, city) VALUES ($1, $2, 'Москва')
     ON CONFLICT (user_id) DO NOTHING`,
    [u.id, email.split("@")[0]],
  );
  return { id: u.id, token: await signAccessToken(u.id) };
}

const alice = await makeUser("voice-a@test.local");
const bob = await makeUser("voice-b@test.local");
const convo = await queryOne(
  `INSERT INTO conversations DEFAULT VALUES RETURNING id`,
);
await query(
  `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
  [convo.id, alice.id, bob.id],
);

// ── Тестовые аудиофайлы: настоящие WebM/Opus и MP4/AAC через ffmpeg ─────────
const webmPath = path.join(mediaDir, "sample.webm");
const m4aPath = path.join(mediaDir, "sample.m4a");
execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libopus", webmPath], { stdio: "pipe" });
execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac", m4aPath], { stdio: "pipe" });
const webm = readFileSync(webmPath);
const m4a = readFileSync(m4aPath);

// Собирает multipart/form-data точно как браузер: поля, затем файл, без
// ручного Content-Type в XHR (boundary ставит сам браузер).
function multipartBody(fields, file) {
  const boundary = "----testboundary" + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
  ));
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function sendVoice(token, { buffer, name, type, clientTempId, durationMs }) {
  const { payload, contentType } = multipartBody(
    { durationMs: String(durationMs), clientTempId },
    { data: buffer, name, type },
  );
  return app.inject({
    method: "POST",
    url: `/api/chat/conversations/${convo.id}/voice`,
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload,
  });
}

// ── Сценарии ─────────────────────────────────────────────────────────────────
const tempId = crypto.randomUUID();

// 1. Валидный WebM/Opus — должен приниматься.
const ok = await sendVoice(alice.token, { buffer: webm, name: "voice.webm", type: "audio/webm", clientTempId: tempId, durationMs: 2000 });
assert.equal(ok.statusCode, 200, `валидный WebM: получен ${ok.statusCode}: ${ok.body}`);
const first = ok.json();
assert.equal(first.kind, "voice");
assert.ok(first.mediaUrl, "mediaUrl должен вернуться");
assert.ok(first.durationMs >= 400, "длительность измерена ffmpeg");

// 2. Повтор с тем же clientTempId — дедупликация, то же сообщение, без дубля.
const retry = await sendVoice(alice.token, { buffer: webm, name: "voice.webm", type: "audio/webm", clientTempId: tempId, durationMs: 2000 });
assert.equal(retry.statusCode, 200, `повтор: ${retry.statusCode}: ${retry.body}`);
assert.equal(retry.json().id, first.id, "повтор должен вернуть то же сообщение");
const count = await queryOne(
  `SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND client_temp_id = $2`,
  [convo.id, tempId],
);
assert.equal(count.n, 1, "дубль не должен создаваться");

// 3. Битый clientTempId (не UUID) → 400 с понятным сообщением.
const badTemp = await sendVoice(alice.token, { buffer: webm, name: "voice.webm", type: "audio/webm", clientTempId: "not-a-uuid", durationMs: 2000 });
assert.equal(badTemp.statusCode, 400, `не-UUID должен отклоняться: ${badTemp.statusCode}`);

// 4. durationMs в секундах ("2") → 400 (минимум 400 мс).
const seconds = await sendVoice(alice.token, { buffer: webm, name: "voice.webm", type: "audio/webm", clientTempId: crypto.randomUUID(), durationMs: 2 });
assert.equal(seconds.statusCode, 400, `секунды вместо миллисекунд должны отклоняться: ${seconds.statusCode}`);

// 5. Файл меньше 512 байт → 400 «Запись пустая».
const tiny = await sendVoice(alice.token, { buffer: Buffer.alloc(100), name: "voice.webm", type: "audio/webm", clientTempId: crypto.randomUUID(), durationMs: 2000 });
assert.equal(tiny.statusCode, 400, `пустой файл должен отклоняться: ${tiny.statusCode}`);
assert.match(tiny.json().message ?? "", /пустая/i);

// 6. Мусор вместо аудио (>512 байт, без сигнатур) → 400 про формат.
const junk = await sendVoice(alice.token, { buffer: Buffer.alloc(2048, 7), name: "voice.webm", type: "audio/webm", clientTempId: crypto.randomUUID(), durationMs: 2000 });
assert.equal(junk.statusCode, 400, `не-аудио должно отклоняться: ${junk.statusCode}`);
assert.match(junk.json().message ?? "", /WebM|MP4/i);

// 7. Валидный MP4/AAC (ветка iPhone Safari) — должен приниматься.
const mp4 = await sendVoice(bob.token, { buffer: m4a, name: "voice.m4a", type: "audio/mp4", clientTempId: crypto.randomUUID(), durationMs: 2000 });
assert.equal(mp4.statusCode, 200, `валидный MP4: получен ${mp4.statusCode}: ${mp4.body}`);
assert.equal(mp4.json().mediaMime, "audio/mp4");

// 8. Чужой диалог → 403.
const outsider = await makeUser("voice-outsider@test.local");
const denied = await sendVoice(outsider.token, { buffer: webm, name: "voice.webm", type: "audio/webm", clientTempId: crypto.randomUUID(), durationMs: 2000 });
assert.equal(denied.statusCode, 403, `чужой диалог: ${denied.statusCode}`);

console.log("voice.test.mjs: все проверки пройдены");
process.exit(0);
