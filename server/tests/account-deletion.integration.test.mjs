import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const denied = "Requires GitHub Actions and an isolated account deletion SQL database";
let target;
try { target = new URL(process.env.DATABASE_URL || "postgres://invalid/"); }
catch { throw new Error(denied); }
if (process.env.NODE_ENV !== "test" || process.env.GITHUB_ACTIONS !== "true" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" || target.port !== "5432" ||
    target.username !== "audit" || !/^\/server_unit_[1-9]\d*$/.test(target.pathname) ||
    target.search !== "" || target.hash !== "") throw new Error(denied);

const { default: Fastify } = await import("fastify");
const { pool, query, queryOne } = await import("../src/db.ts");
const { settingsRoutes } = await import("../src/routes/settings.ts");
const { registerErrorHandler } = await import("../src/http.ts");
const { signAccessToken, issueRefreshToken } = await import("../src/auth/tokens.ts");
const { env } = await import("../src/env.ts");
const app = Fastify({ logger: false });
registerErrorHandler(app);

async function fixture() {
  const id = randomUUID();
  await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')", [id, `${id}@deletion.example.invalid`]);
  await query("INSERT INTO privacy_settings(user_id,visible_in_feed) VALUES($1,true)", [id]);
  for (let i = 0; i < 3; i++) await issueRefreshToken(id);
  await query("UPDATE refresh_tokens SET revoked_at=now()-interval '1 hour' WHERE id=(SELECT id FROM refresh_tokens WHERE user_id=$1 ORDER BY id LIMIT 1)", [id]);
  return { id, token: await signAccessToken(id) };
}
async function snapshot(id) {
  const user = await queryOne("SELECT deleted_at::text,updated_at::text FROM users WHERE id=$1", [id]);
  const privacy = await queryOne("SELECT visible_in_feed,updated_at::text FROM privacy_settings WHERE user_id=$1", [id]);
  const tokens = await query("SELECT id,revoked_at::text FROM refresh_tokens WHERE user_id=$1 ORDER BY id", [id]);
  const requests = await query("SELECT id,reason,comment,restore_until::text FROM deletion_requests WHERE user_id=$1 ORDER BY id", [id]);
  return { user, privacy, tokens, requests };
}
function remove(f, payload = { reason: "break", comment: "isolated deletion check" }) {
  return app.inject({ method: "DELETE", url: "/api/settings/account", headers: { authorization: `Bearer ${f.token}` }, payload });
}

try {
  const identity = await queryOne("SELECT current_database() AS db,current_user AS role");
  assert.equal(identity.db, target.pathname.slice(1));
  assert.equal(identity.role, "audit");
  await query("SELECT 'deletion_requests'::regclass");
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.ready();
  await query(`CREATE FUNCTION account_deletion_atomicity_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'account_deletion_atomicity_fault'; END;
  $$`);

  await test("account deletion: real HTTP handler and isolated PostgreSQL", async t => {
    await t.test("unauthorized request does not modify an account", async () => {
      const f = await fixture(), before = await snapshot(f.id);
      const response = await app.inject({ method: "DELETE", url: "/api/settings/account", payload: {} });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(await snapshot(f.id), before);
    });
    await t.test("success commits all four changes and preserves other accounts", async () => {
      const f = await fixture(), other = await fixture();
      const before = await snapshot(f.id), otherBefore = await snapshot(other.id);
      const started = Date.now(), response = await remove(f), finished = Date.now();
      assert.equal(response.statusCode, 200);
      const receipt = response.json(), after = await snapshot(f.id);
      assert.equal(receipt.restoreDays, env.ACCOUNT_RESTORE_DAYS);
      assert.ok(after.user.deleted_at);
      assert.equal(after.privacy.visible_in_feed, false);
      assert.equal(after.tokens.length, 3);
      assert.ok(after.tokens.every(row => row.revoked_at));
      const old = before.tokens.find(row => row.revoked_at);
      assert.equal(after.tokens.find(row => row.id === old.id).revoked_at, old.revoked_at);
      assert.equal(after.requests.length, 1);
      assert.equal(receipt.id, after.requests[0].id);
      assert.equal(after.requests[0].reason, "break");
      assert.equal(after.requests[0].comment, "isolated deletion check");
      const until = new Date(after.requests[0].restore_until).getTime();
      const window = env.ACCOUNT_RESTORE_DAYS * 86400000;
      assert.ok(until >= started + window && until <= finished + window);
      assert.deepEqual(await snapshot(other.id), otherBefore);
      assert.equal((await remove(f)).statusCode, 403);
      assert.equal((await snapshot(f.id)).requests.length, 1);
    });
    await t.test("invalid input changes nothing", async () => {
      const f = await fixture(), before = await snapshot(f.id);
      assert.equal((await remove(f, { comment: "x".repeat(1001) })).statusCode, 400);
      assert.deepEqual(await snapshot(f.id), before);
    });
    for (const [table, event] of [["users", "UPDATE"], ["privacy_settings", "UPDATE"], ["refresh_tokens", "UPDATE"], ["deletion_requests", "INSERT"]]) {
      await t.test(`failure in ${table} rolls back every deletion change`, async () => {
        const f = await fixture(), before = await snapshot(f.id);
        await query(`CREATE TRIGGER account_deletion_atomicity_fault BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION account_deletion_atomicity_fault()`);
        try {
          const response = await remove(f);
          assert.equal(response.statusCode, 500);
          assert.equal(response.json().message, "Внутренняя ошибка сервера");
          assert.deepEqual(await snapshot(f.id), before);
        } finally {
          await query(`DROP TRIGGER account_deletion_atomicity_fault ON ${table}`);
        }
      });
    }
    await t.test("concurrent requests create one deletion receipt", async () => {
      const f = await fixture();
      const responses = await Promise.all([remove(f), remove(f)]);
      assert.equal(responses.filter(response => response.statusCode === 200).length, 1);
      assert.ok(responses.every(response => [200, 403, 404].includes(response.statusCode)));
      const after = await snapshot(f.id);
      assert.ok(after.user.deleted_at);
      assert.equal(after.privacy.visible_in_feed, false);
      assert.ok(after.tokens.every(row => row.revoked_at));
      assert.equal(after.requests.length, 1);
    });
  });
} finally {
  await app.close();
  await pool.end();
}
