import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const denied = "Requires GitHub Actions and an isolated OAuth linked-login SQL database";
let target;
try { target = new URL(process.env.DATABASE_URL || "postgres://invalid/"); }
catch { throw new Error(denied); }
if (process.env.NODE_ENV !== "test" || process.env.GITHUB_ACTIONS !== "true" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" || target.port !== "5432" ||
    target.username !== "audit" || !/^\/server_unit_[1-9]\d*$/.test(target.pathname) ||
    target.search !== "" || target.hash !== "") throw new Error(denied);

process.env.YANDEX_CLIENT_ID = "isolated-link-regression-client";
process.env.YANDEX_CLIENT_SECRET = "isolated-link-regression-secret-not-production";
process.env.PUBLIC_BASE_URL = "http://127.0.0.1";

const { default: Fastify } = await import("fastify");
const { default: cookie } = await import("@fastify/cookie");
const { pool, query, queryOne } = await import("../src/db.ts");
const { authRoutes } = await import("../src/routes/auth.ts");
const { registerErrorHandler } = await import("../src/http.ts");
const app = Fastify({ logger: false });
registerErrorHandler(app);
const originalFetch = globalThis.fetch;
const providerProfiles = new Map();

// Only provider HTTP is simulated; routes, cookies, transactions and SQL are real.
// Every other outbound fetch is denied, including an unexpected provider URL.
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === "https://oauth.yandex.ru/token") {
    const body = new URLSearchParams(init.body);
    const code = body.get("code");
    assert.ok(providerProfiles.has(code), "Unknown isolated provider code");
    assert.ok(body.get("code_verifier"));
    return new Response(JSON.stringify({ access_token: code }), { status: 200 });
  }
  if (url === "https://login.yandex.ru/info?format=json") {
    const authorization = new Headers(init.headers).get("authorization") || "";
    assert.ok(authorization.startsWith("OAuth "));
    const profile = providerProfiles.get(authorization.slice(6));
    assert.ok(profile, "Unknown isolated provider token");
    return new Response(JSON.stringify(profile), { status: 200 });
  }
  throw new Error("Outbound fetch denied in isolated OAuth regression");
};
function cookieHeader(response, name) {
  const values = [].concat(response.headers["set-cookie"] || []);
  const value = values.find(item => item.startsWith(`${name}=`));
  assert.ok(value, `Expected cookie ${name}`);
  return value.split(";")[0];
}
async function fixture() {
  const email = `${randomUUID()}@oauth-link.example.invalid`;
  const response = await app.inject({ method: "POST", url: "/api/auth/register", payload: {
    email, password: "Isolated-mail-account-A7!", name: "Original email profile",
  } });
  assert.equal(response.statusCode, 200);
  const session = response.json(), id = session.user.id, peer = randomUUID();
  await query("UPDATE users SET email_verified=true WHERE id=$1", [id]);
  await query("UPDATE profiles SET age=32,city='SQL Test City',bio='Original biography',onboarded_at=now() WHERE user_id=$1", [id]);
  const avatar = `/uploads/isolated-oauth-${randomUUID()}.jpg`;
  await query("INSERT INTO profile_media(user_id,kind,url,is_primary) VALUES($1,'photo',$2,true)", [id, avatar]);
  await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture-not-used-for-login')", [peer, `${peer}@oauth-link.example.invalid`]);
  await query("INSERT INTO profiles(user_id,name) VALUES($1,'SQL peer')", [peer]);
  const conversation = (await queryOne("INSERT INTO conversations DEFAULT VALUES RETURNING id")).id;
  await query("INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)", [conversation, id, peer]);
  await query("INSERT INTO messages(conversation_id,author_id,text) VALUES($1,$2,'Original outgoing'),($1,$3,'Original incoming')", [conversation, id, peer]);
  return { id, token: session.token, email, avatar, conversation };
}
async function snapshot(f) {
  return {
    user: await queryOne("SELECT email,email_verified,phone,phone_verified FROM users WHERE id=$1", [f.id]),
    profile: await queryOne("SELECT name,age,city,bio,onboarded_at::text FROM profiles WHERE user_id=$1", [f.id]),
    media: await query("SELECT id,kind,url,is_primary FROM profile_media WHERE user_id=$1 ORDER BY id", [f.id]),
    participants: await query("SELECT user_id FROM conversation_participants WHERE conversation_id=$1 ORDER BY user_id", [f.conversation]),
    messages: await query("SELECT id,author_id,text FROM messages WHERE conversation_id=$1 ORDER BY id", [f.conversation]),
  };
}
async function userCount() {
  return (await queryOne("SELECT count(*)::int AS n FROM users")).n
;
}
async function identities(token) {
  const response = await app.inject({ url: "/api/auth/identities", headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.statusCode, 200);
  return response.json().linked;
}
async function flow(subject, token, cancel = false) {
  const start = token
    ? await app.inject({ method: "POST", url: "/api/auth/identities/yandex/link/start", headers: { authorization: `Bearer ${token}` } })
    : await app.inject({ url: "/api/auth/yandex/start" });
  assert.equal(start.statusCode, token ? 200 : 302);
  const authorization = new URL(token ? start.json().url : start.headers.location);
  const state = authorization.searchParams.get("state");
  assert.ok(state);
  const code = randomUUID();
  providerProfiles.set(code, { id: subject, display_name: "Provider name must not overwrite profile" });
  const params = new URLSearchParams({ state, ...(cancel ? { error: "access_denied" } : { code }) });
  const response = await app.inject({ url: `/api/auth/yandex/callback?${params}`, headers: { cookie: cookieHeader(start, "ya_oauth_yandex") } });
  assert.equal(response.statusCode, 302);
  return response;
}
async function link(f, subject) {
  const response = await flow(subject, f.token);
  assert.equal(response.headers.location, "http://127.0.0.1/settings?oauth=linked");
  assert.ok((await identities(f.token)).includes("yandex"));
}
async function login(subject) {
  const callback = await flow(subject);
  const redirect = new URL(callback.headers.location);
  assert.equal(redirect.pathname, "/oauth-callback");
  assert.equal(redirect.searchParams.get("oauth"), null);
  const result = await app.inject({ method: "POST", url: "/api/auth/oauth/result",
    headers: { cookie: cookieHeader(callback, "ya_oauth_result") },
    payload: { provider: "yandex", state: redirect.searchParams.get("state") },
  });
  assert.equal(result.statusCode, 200);
  const session = result.json();
  const me = await app.inject({ url: "/api/auth/me", headers: { authorization: `Bearer ${session.token}` } });
  assert.equal(me.statusCode, 200);
  return { ...session, user: me.json() };
}
try {
  const identity = await queryOne("SELECT current_database() AS db,current_user AS role");
  assert.equal(identity.db, target.pathname.slice(1));
  assert.equal(identity.role, "audit");
  await app.register(cookie);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.ready();
  await test("linked Yandex login: real routes and isolated PostgreSQL, simulated provider", async t => {
    await t.test("email registration, link, separate login preserve ID, photo and conversation", async () => {
      const f = await fixture(), before = await snapshot(f), count = await userCount(), subject = randomUUID();
      await link(f, subject);
      const session = await login(subject);
      assert.equal(session.isNew, false);
      assert.equal(session.user.id, f.id);
      assert.equal(session.user.name, "Original email profile");
      assert.equal(session.user.age, 32);
      assert.equal(session.user.city, "SQL Test City");
      assert.equal(session.user.avatarUrl, f.avatar);
      assert.equal(await userCount(), count);
      assert.deepEqual(await snapshot(f), before);
    });
    await t.test("independent concurrent browser flows never create duplicate users", async () => {
      const f = await fixture(), subject = randomUUID();
      await link(f, subject);
      const before = await snapshot(f), count = await userCount();
      const sessions = await Promise.all(Array.from({ length: 4 }, () => login(subject)));
      assert.ok(sessions.every(session => session.user.id === f.id && session.isNew === false));
      assert.equal(await userCount(), count);
      assert.equal((await queryOne("SELECT count(*)::int AS n FROM user_identities WHERE provider='yandex' AND provider_user_id=$1 AND user_id=$2", [subject, f.id])).n, 1);
      assert.deepEqual(await snapshot(f), before);
    });
    await t.test("callback refuses linking an owned Yandex ID to another email account", async () => {
      const a = await fixture(), b = await fixture(), subject = randomUUID();
      await link(a, subject);
      const count = await userCount(), beforeA = await snapshot(a), beforeB = await snapshot(b);
      const refused = await flow(subject, b.token);
      assert.equal(refused.headers.location, "http://127.0.0.1/settings?oauth=identity_taken");
      assert.equal((await identities(b.token)).includes("yandex"), false);
      assert.equal((await login(subject)).user.id, a.id);
      assert.equal(await userCount(), count);
      assert.deepEqual(await snapshot(a), beforeA);
      assert.deepEqual(await snapshot(b), beforeB);
    });
    await t.test("cancelled provider authorization never reports a successful link", async () => {
      const f = await fixture(), before = await snapshot(f), count = await userCount();
      const response = await flow(randomUUID(), f.token, true);
      assert.equal(response.headers.location, "http://127.0.0.1/settings?oauth=failed");
      assert.equal((await identities(f.token)).includes("yandex"), false);
      assert.equal(await userCount(), count);
      assert.deepEqual(await snapshot(f), before);
    });
    for (const column of ["blocked_at", "deleted_at"]) {
      await t.test(`${column} refuses linked login without creating a replacement account`, async () => {
        const f = await fixture(), subject = randomUUID();
        await link(f, subject);
        await query(`UPDATE users SET ${column}=now() WHERE id=$1`, [f.id]);
        const count = await userCount(), before = await snapshot(f);
        const response = await flow(subject);
        assert.equal(response.headers.location, "http://127.0.0.1/oauth-callback?oauth=account_unavailable");
        assert.equal(await userCount(), count);
        assert.deepEqual(await snapshot(f), before);
        assert.equal((await queryOne("SELECT user_id FROM user_identities WHERE provider='yandex' AND provider_user_id=$1", [subject])).user_id, f.id);
      });
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  await app.close();
  await pool.end();
}
