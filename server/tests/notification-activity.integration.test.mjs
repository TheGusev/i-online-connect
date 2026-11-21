import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// The workflow gives each server test file its own migrated disposable database.
const denied = "Requires GitHub Actions and an approved isolated activity SQL database";
let target;
try { target = new URL(process.env.DATABASE_URL || "postgres://invalid/"); }
catch { throw new Error(denied); }
if (process.env.NODE_ENV !== "test" || process.env.GITHUB_ACTIONS !== "true" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" || target.port !== "5432" ||
    target.username !== "audit" || !/^\/server_unit_[1-9]\d*$/.test(target.pathname) ||
    target.search !== "" || target.hash !== "") throw new Error(denied);

const { pool, query, queryOne } = await import("../src/db.ts");
const { recordNotificationActivity, getNotificationActivitySnapshot } = await import("../src/notifications/activity.ts");
const { captureNotificationActorActivity } = await import("../src/notifications/activity-integration.ts");
let endRequested = false;
async function user({ seed = false, deleted = false } = {}) {
  const id = randomUUID();
  await query("INSERT INTO users(id,email,password_hash,deleted_at) VALUES($1,$2,'test-only',CASE WHEN $3 THEN statement_timestamp() ELSE NULL END)", [id, `${id}@activity.example.invalid`, deleted]);
  await query("INSERT INTO profiles(user_id,name,city,age,is_seed) VALUES($1,'Activity SQL fixture','Тест',25,$2)", [id, seed]);
  return id;
}
async function conversation(author, peer, notes = false) {
  const id = randomUUID();
  await query("INSERT INTO conversations(id,notes_owner_id,notes_title,notes_request_id) VALUES($1,$2,$3,$4)", [id, notes ? author : null, notes ? "Activity test" : null, notes ? randomUUID() : null]);
  await query("INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)", [id, author]);
  if (peer && !notes) await query("INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)", [id, peer]);
  return id;
}
async function message(author, conversationId, { minutesAgo = 5, deleted = false } = {}) {
  const id = randomUUID();
  await query("INSERT INTO messages(id,conversation_id,author_id,text,created_at,deleted_at) VALUES($1,$2,$3,'activity SQL fixture',statement_timestamp()-($4::int*interval '1 minute'),CASE WHEN $5 THEN statement_timestamp() ELSE NULL END)", [id, conversationId, author, minutesAgo, deleted]);
  return id;
}
async function pair(authorOptions = {}, peerOptions = {}, notes = false) {
  const author = await user(authorOptions), peer = await user(peerOptions);
  const conversationId = await conversation(author, peer, notes);
  return { author, peer, conversationId };
}
async function count(userId) {
  return (await queryOne("SELECT count(*)::int AS n FROM notification_activity_slots WHERE user_id=$1", [userId])).n;
}
async function capture(p, options) {
  const messageId = await message(p.author, p.conversationId, options);
  return captureNotificationActorActivity(p.author, { conversationId: p.conversationId, messageId });
}
try {
  const identity = await queryOne("SELECT current_database() AS db, current_user AS role");
  assert.equal(identity.db, target.pathname.slice(1));
  assert.equal(identity.role, "audit");
  await query("SELECT 'notification_activity_slots'::regclass");
  await test("notification activity: production functions against isolated PostgreSQL", async t => {
    await t.test("reading an empty snapshot never records activity", async () => {
      const id = await user();
      const a = await getNotificationActivitySnapshot(id), b = await getNotificationActivitySnapshot(id);
      assert.equal(a.activeMinutes, 0); assert.equal(a.stars, 1);
      assert.equal(b.activeMinutes, 0); assert.equal(await count(id), 0);
      assert.equal(a.version, 1); assert.equal(a.windowSeconds, 3600);
      assert.ok(Number.isFinite(Date.parse(a.calculatedAt)));
    });
    await t.test("explicit activity records a real user but excludes seed and deleted users", async () => {
      const real = await user(), seed = await user({ seed: true }), deleted = await user({ deleted: true });
      for (const id of [real, seed, deleted]) await recordNotificationActivity(id);
      assert.equal(await count(real), 1); assert.equal(await count(seed), 0); assert.equal(await count(deleted), 0);
    });
    for (const [minutes, stars] of [[0,1],[2,1],[3,2],[6,2],[7,3],[11,3],[12,4],[19,4],[20,5],[40,5]]) {
      await t.test(`${minutes} occupied recent minute slots produce ${stars} stars`, async () => {
        const id = await user();
        await query("INSERT INTO notification_activity_slots(user_id,slot,last_action_at) SELECT $1,i::smallint,statement_timestamp()-(i*interval '1 minute') FROM generate_series(0,$2::int-1) AS i", [id, minutes]);
        const s = await getNotificationActivitySnapshot(id);
        assert.equal(s.activeMinutes, minutes); assert.equal(s.stars, stars);
      });
    }
    await t.test("snapshot excludes old and future timestamps with timing margins", async () => {
      const id = await user();
      await query("INSERT INTO notification_activity_slots(user_id,slot,last_action_at) VALUES($1,0,statement_timestamp()-interval '55 minutes'),($1,1,statement_timestamp()-interval '65 minutes'),($1,2,statement_timestamp()+interval '5 minutes')", [id]);
      assert.equal((await getNotificationActivitySnapshot(id)).activeMinutes, 1);
    });
    await t.test("the 64-slot ring reuses an existing cell without growing", async () => {
      const id = await user();
      await query("INSERT INTO notification_activity_slots(user_id,slot,last_action_at) SELECT $1,i::smallint,statement_timestamp()-interval '2 hours' FROM generate_series(0,63) AS i", [id]);
      await recordNotificationActivity(id);
      assert.equal(await count(id), 64); assert.equal((await getNotificationActivitySnapshot(id)).activeMinutes, 1);
    });
    await t.test("concurrent redelivery of one message records one minute", async () => {
      const p = await pair(), messageId = await message(p.author, p.conversationId);
      const action = { conversationId: p.conversationId, messageId };
      const results = await Promise.all(Array.from({ length: 8 }, () => captureNotificationActorActivity(p.author, action)));
      assert.ok(results.every(s => s?.activeMinutes === 1)); assert.equal(await count(p.author), 1);
      assert.equal(await count(p.peer), 0);
    });
    await t.test("older same-minute messages cannot rewind last_action_at", async () => {
      const p = await pair(), newer = randomUUID(), older = randomUUID();
      await query("INSERT INTO messages(id,conversation_id,author_id,text,created_at) VALUES($1,$3,$4,'newer',date_trunc('minute',statement_timestamp())-interval '5 minutes'+interval '40 seconds'),($2,$3,$4,'older',date_trunc('minute',statement_timestamp())-interval '5 minutes'+interval '10 seconds')", [newer, older, p.conversationId, p.author]);
      await captureNotificationActorActivity(p.author, { conversationId: p.conversationId, messageId: newer });
      const before = await queryOne("SELECT last_action_at::text AS at FROM notification_activity_slots WHERE user_id=$1", [p.author]);
      await captureNotificationActorActivity(p.author, { conversationId: p.conversationId, messageId: older });
      const after = await queryOne("SELECT last_action_at::text AS at FROM notification_activity_slots WHERE user_id=$1", [p.author]);
      assert.equal(after.at, before.at); assert.equal(await count(p.author), 1);
    });
    const excluded = [
      ["notes", {}, {}, true, {}],
      ["seed author", { seed: true }, {}, false, {}],
      ["seed-only peer", {}, { seed: true }, false, {}],
      ["deleted author", { deleted: true }, {}, false, {}],
      ["deleted peer", {}, { deleted: true }, false, {}],
      ["deleted message", {}, {}, false, { deleted: true }],
      ["old message", {}, {}, false, { minutesAgo: 70 }],
      ["future message", {}, {}, false, { minutesAgo: -5 }],
    ];
    for (const [name, a, b, notes, options] of excluded) {
      await t.test(`chat activity excludes ${name}`, async () => {
        const p = await pair(a, b, notes);
        const s = await capture(p, options);
        assert.ok(s); assert.equal(s.activeMinutes, 0); assert.equal(await count(p.author), 0);
      });
    }
    await t.test("actor and conversation must match the source message", async () => {
      const p = await pair(), other = await user(), messageId = await message(p.author, p.conversationId);
      await captureNotificationActorActivity(other, { conversationId: p.conversationId, messageId });
      await captureNotificationActorActivity(p.author, { conversationId: randomUUID(), messageId });
      await captureNotificationActorActivity(p.author, { conversationId: p.conversationId, messageId: randomUUID() });
      assert.equal(await count(other), 0); assert.equal(await count(p.author), 0);
    });
    await t.test("an author without any peer does not earn chat activity", async () => {
      const author = await user(), conversationId = await conversation(author, null);
      const s = await capture({ author, conversationId });
      assert.equal(s.activeMinutes, 0); assert.equal(await count(author), 0);
    });
    await t.test("missing actor returns null", async () => {
      assert.equal(await captureNotificationActorActivity(null), null);
      assert.equal(await captureNotificationActorActivity(undefined), null);
    });
    // Last case intentionally ends the test-only pool. It is not a delivery-route test.
    await t.test("database unavailability returns null without throwing and warnings are throttled", async () => {
      const id = await user(), original = console.warn, warnings = [];
      endRequested = true; await pool.end();
      console.warn = (...args) => warnings.push(args);
      try {
        assert.equal(await captureNotificationActorActivity(id), null);
        assert.equal(await captureNotificationActorActivity(id), null);
        assert.equal(warnings.length, 1);
        assert.equal(JSON.stringify(warnings).includes(id), false);
      } finally { console.warn = original; }
    });
  });
} finally {
  if (!endRequested) await pool.end();
}
