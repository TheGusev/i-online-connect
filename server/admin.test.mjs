/**
 * Сквозной тест админки: доступ, действия, аудит.
 * Запуск: node --experimental-strip-types /tmp/admin.test.mjs (из server/)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { pool, query, queryOne } = await import("./src/db.ts");
const { hashPassword } = await import("./src/auth/passwords.ts");
const { signAccessToken } = await import("./src/auth/tokens.ts");
const { adminRoutes } = await import("./src/routes/admin.ts");
const { listingRoutes } = await import("./src/routes/listings.ts");
const { registerErrorHandler } = await import("./src/http.ts");
const Fastify = (await import("fastify")).default;

const app = Fastify();
registerErrorHandler(app);
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(listingRoutes, { prefix: "/api/listings" });

async function makeUser(email, role = "user") {
  const hash = await hashPassword("Sup3r-Secret-Pass");
  const u = await queryOne(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3::user_role)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role RETURNING id`,
    [email, hash, role],
  );
  await query(
    `INSERT INTO profiles (user_id, name, city) VALUES ($1, $2, 'Москва')
     ON CONFLICT (user_id) DO NOTHING`,
    [u.id, email.split("@")[0]],
  );
  return { id: u.id, token: await signAccessToken(u.id) };
}

const admin = await makeUser("admin@test.local", "admin");
const user = await makeUser("user@test.local");
const victim = await makeUser("victim@test.local");

const auth = (t) => ({ authorization: `Bearer ${t}` });
const call = (method, url, token, payload) =>
  app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

// 1. Обычный пользователь не имеет доступа ни к одному разделу.
for (const path of [
  "/api/admin/users",
  "/api/admin/reports",
  "/api/admin/verifications",
  "/api/admin/support",
  "/api/admin/listings",
  "/api/admin/spaces",
  "/api/admin/stats",
]) {
  const res = await call("GET", path, user.token);
  assert.equal(res.statusCode, 403, `${path} должен быть 403 для пользователя, а не ${res.statusCode}`);
}
// Без токена — 401.
assert.equal((await app.inject({ method: "GET", url: "/api/admin/users" })).statusCode, 401);

// 2. Админ читает все списки.
for (const path of [
  "/api/admin/users?q=victim",
  "/api/admin/users?blocked=no&verified=no",
  "/api/admin/reports?state=new",
  "/api/admin/verifications?status=pending",
  "/api/admin/support?status=new",
  "/api/admin/listings?state=active",
  "/api/admin/spaces",
  "/api/admin/actions",
]) {
  const res = await call("GET", path, admin.token);
  assert.equal(res.statusCode, 200, `${path} → ${res.statusCode} ${res.body}`);
  const body = res.json();
  assert.ok(Array.isArray(body.items), `${path}: нет items`);
}

const users = (await call("GET", "/api/admin/users?q=victim", admin.token)).json();
assert.equal(users.items.length, 1);
assert.equal(users.items[0].email, "victim@test.local");
assert.ok(!("passwordHash" in users.items[0]) && !JSON.stringify(users).includes("$argon2"));

// 3. Карточка пользователя.
const card = (await call("GET", `/api/admin/users/${victim.id}`, admin.token)).json();
assert.equal(card.email, "victim@test.local");
assert.ok(Array.isArray(card.loginAttempts));
assert.ok(Array.isArray(card.media));
assert.equal(typeof card.activeSessions, "number");
assert.ok(!JSON.stringify(card).includes("selfie_path"));

// 4. Блокировка: 403 на обычных маршрутах, сессии отозваны.
await query(
  `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
   VALUES ($1, 'test-hash', now() + interval '10 days')`,
  [victim.id],
);
const blocked = await call("POST", `/api/admin/users/${victim.id}/block`, admin.token, {
  reason: "Спам в объявлениях",
});
assert.equal(blocked.statusCode, 200, blocked.body);
const flag = await queryOne("SELECT blocked_at, blocked_reason FROM users WHERE id = $1", [victim.id]);
assert.ok(flag.blocked_at);
const live = await queryOne(
  "SELECT count(*)::int AS c FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL",
  [victim.id],
);
assert.equal(live.c, 0, "сессии заблокированного должны быть отозваны");

const denied = await call("GET", "/api/listings", victim.token);
assert.equal(denied.statusCode, 403, `заблокированный должен получить 403, получил ${denied.statusCode}`);

// Разблокировка возвращает доступ.
assert.equal((await call("POST", `/api/admin/users/${victim.id}/unblock`, admin.token, {})).statusCode, 200);
assert.equal((await call("GET", "/api/listings", victim.token)).statusCode, 200);

// Себя блокировать нельзя.
assert.equal(
  (await call("POST", `/api/admin/users/${admin.id}/block`, admin.token, { reason: "тест" })).statusCode,
  400,
);

// 5. Жалоба: изменение статуса.
const report = await queryOne(
  `INSERT INTO reports (reporter_id, subject_id, category, source, details)
   VALUES ($1, $2, 'behavior', 'chat', 'грубит') RETURNING id`,
  [user.id, victim.id],
);
const patched = await call("PATCH", `/api/admin/reports/${report.id}`, admin.token, {
  state: "resolved",
  note: "предупреждение выдано",
});
assert.equal(patched.statusCode, 200, patched.body);
const reportRow = await queryOne("SELECT state, resolved_at, moderator_id FROM reports WHERE id = $1", [report.id]);
assert.equal(reportRow.state, "resolved");
assert.ok(reportRow.resolved_at && reportRow.moderator_id === admin.id);

// 6. Верификация: ручное подтверждение поднимает уровень доверия.
const ver = await queryOne(
  `INSERT INTO verifications (user_id, status, selfie_path, reference_url)
   VALUES ($1, 'pending', '/private/selfie.jpg', 'https://x/photo.jpg') RETURNING id`,
  [victim.id],
);
const queue = (await call("GET", "/api/admin/verifications?status=pending", admin.token)).json();
assert.ok(queue.items.some((item) => item.id === ver.id));
assert.ok(!JSON.stringify(queue).includes("/private/selfie.jpg"), "путь к селфи не должен утекать");
assert.equal(
  (await call("PATCH", `/api/admin/verifications/${ver.id}`, admin.token, { status: "verified", note: "ок" })).statusCode,
  200,
);
const prof = await queryOne("SELECT video_verified, trust_level FROM profiles WHERE user_id = $1", [victim.id]);
assert.equal(prof.video_verified, true);
assert.equal(prof.trust_level, "verified");

// 7. Поддержка: статус + ответ письмом (SMTP не настроен → лог, не падение).
const req = await queryOne(
  `INSERT INTO support_requests (email, topic, message) VALUES ($1, 'other', 'помогите разобраться, пожалуйста')
   RETURNING id`,
  ["ask@test.local"],
);
const sup = await call("PATCH", `/api/admin/support/${req.id}`, admin.token, {
  status: "closed",
  reply: "Разобрались, доступ восстановлен.",
});
assert.equal(sup.statusCode, 200, sup.body);
const supRow = await queryOne("SELECT status, reply, replied_at, replied_by FROM support_requests WHERE id = $1", [req.id]);
assert.equal(supRow.status, "closed");
assert.ok(supRow.reply && supRow.replied_at && supRow.replied_by === admin.id);

// 8. Объявление: снятие с публикации.
const listing = await queryOne(
  `INSERT INTO listings (author_id, category, city, title) VALUES ($1, 'service', 'Москва', 'Помогу с ремонтом')
   RETURNING id`,
  [victim.id],
);
assert.equal(
  (await call("PATCH", `/api/admin/listings/${listing.id}`, admin.token, { state: "closed", note: "нарушение" })).statusCode,
  200,
);
assert.equal((await queryOne("SELECT state FROM listings WHERE id = $1", [listing.id])).state, "closed");

// 9. Сообщество: список и удаление.
const space = await queryOne(
  `INSERT INTO spaces (title, category, host_id, city) VALUES ('Тест-клуб', 'games', $1, 'Москва') RETURNING id`,
  [victim.id],
);
const spaces = (await call("GET", "/api/admin/spaces?q=Тест", admin.token)).json();
assert.ok(spaces.items.some((item) => item.id === space.id));
assert.equal((await call("DELETE", `/api/admin/spaces/${space.id}`, admin.token, { reason: "дубль" })).statusCode, 200);
assert.equal(await queryOne("SELECT id FROM spaces WHERE id = $1", [space.id]), null);

// 10. Статистика.
const stats = (await call("GET", "/api/admin/stats?days=30", admin.token)).json();
assert.equal(stats.signupsByDay.length, 31);
assert.ok(stats.usersTotal >= 3);
assert.equal(typeof stats.activeSessions, "number");
assert.ok(stats.listingsActive >= 0 && stats.reportsOpen >= 0);

// 11. Удаление пользователя — мягкое.
assert.equal((await call("DELETE", `/api/admin/users/${user.id}`, admin.token, { reason: "фейк" })).statusCode, 200);
assert.ok((await queryOne("SELECT deleted_at FROM users WHERE id = $1", [user.id])).deleted_at);

// 12. Аудит: admin_actions + файл журнала.
const actions = await query("SELECT action, target_type FROM admin_actions ORDER BY created_at");
const names = actions.map((a) => a.action);
for (const expected of [
  "user.block",
  "user.unblock",
  "report.resolved",
  "verification.verified",
  "support.update",
  "listing.closed",
  "space.delete",
  "user.delete",
]) {
  assert.ok(names.includes(expected), `в admin_actions нет ${expected}: ${names.join(",")}`);
}
const log = await readFile(process.env.ADMIN_LOG_FILE, "utf8");
const lines = log.trim().split("\n").map((line) => JSON.parse(line));
assert.ok(lines.length > 20);
assert.ok(lines.every((line) => line.path.startsWith("/api/admin")));
assert.ok(lines.some((line) => line.status === 403 && line.userId));
assert.ok(!log.includes("Bearer"), "в аудит-лог не должны попадать токены");

console.log(`OK: ${names.length} действий в admin_actions, ${lines.length} строк аудита`);
await app.close();
await pool.end();
