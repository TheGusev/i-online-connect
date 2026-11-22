import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync, readdirSync } from "node:fs";
import path from "node:path";

const work = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
);
assert.equal(process.env.NODE_ENV, "test");
const target = new URL(process.env.DATABASE_URL || "postgresql://invalid/");
const ci = process.env.GITHUB_ACTIONS === "true";
let root;

if (ci) {
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.port, "5432");
  assert.equal(target.username, "audit");
  assert.match(target.pathname, /^\/server_unit_[0-9]+$/);
  assert.equal(target.searchParams.get("host"), null);
} else {
  assert.equal(typeof process.env.CURSOR_TEST_ROOT, "string");
  root = realpathSync(process.env.CURSOR_TEST_ROOT);
  assert.ok(root.startsWith("/tmp/ya-cursor-it."));
  assert.equal(target.username, "cursor_audit");
  assert.equal(target.pathname, "/cursor_api_test");
  assert.equal(target.port, "55439");
  assert.equal(target.searchParams.get("host"), path.join(root, "socket"));
}

const require = createRequire(path.join(work, "server/package.json"));
const pg = require("pg");
const probe = new pg.Client({ connectionString: process.env.DATABASE_URL });
await probe.connect();

try {
  const row = (await probe.query(
    "SELECT current_database() AS db, current_user AS role, inet_server_addr() AS addr"
  )).rows[0];
  assert.equal(row.db, target.pathname.slice(1));
  assert.equal(row.role, ci ? "audit" : "cursor_audit");

  if (!ci) {
    const data = (await probe.query("SHOW data_directory")).rows[0].data_directory;
    assert.equal(realpathSync(data), path.join(root, "pgdata"));
    assert.equal(row.addr, null);
  }
} finally {
  await probe.end();
}

console.log("ISOLATED_DATABASE_CONFIRMED");

const source = relative =>
  import(pathToFileURL(path.join(work, "server/src", relative)).href);
const { query, queryOne, pool } = await source("db.ts");
const { signAccessToken } = await source("auth/tokens.ts");
const { registerErrorHandler } = await source("http.ts");
const { chatRoutes } = await source("routes/chat.ts");
const app = require("fastify")({ logger: false });
registerErrorHandler(app);
await app.register(chatRoutes, { prefix: "/api/chat" });
await app.ready();

async function makeUser() {
  const id = randomUUID();
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')",
    [id, `${id}@cursor.test`]
  );
  await query(
    "INSERT INTO profiles(user_id,name,age) VALUES($1,'Cursor test',25)",
    [id]
  );
  return { id, token: await signAccessToken(id) };
}

let me, peer, outsider;
const baseTime = "2026-11-01T12:00:00.123456Z";

async function seed(count, mode = "text", micro = false) {
  const conversation = await queryOne(
    "INSERT INTO conversations DEFAULT VALUES RETURNING id"
  );
  await query(
    "INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)",
    [conversation.id, me.id, peer.id]
  );
  await query(
    `INSERT INTO messages
       (conversation_id,author_id,text,kind,media_url,media_mime,duration_ms,created_at)
     SELECT $1,$2,'cursor fixture',
       CASE WHEN $3::text='text' THEN 'text'::message_kind
            WHEN g % 2=0 THEN 'video'::message_kind
            ELSE 'image'::message_kind END,
       CASE WHEN $3::text='text' THEN NULL
            ELSE '/api/media-file/fixture/' || gen_random_uuid()::text END,
       CASE WHEN $3::text='text' THEN NULL
            WHEN g % 2=0 THEN 'video/mp4' ELSE 'image/jpeg' END,
       CASE WHEN $3::text<>'text' AND g % 2=0 THEN 1000 ELSE NULL END,
       $4::timestamptz + CASE WHEN $5::boolean
         THEN g * interval '1 microsecond' ELSE interval '0' END
     FROM generate_series(1,$6::int) AS g`,
    [conversation.id, me.id, mode, baseTime, micro, count]
  );
  return conversation.id;
}

const request = (id, endpoint, who = me, values = {}) => {
  const params = new URLSearchParams({ limit: "50", ...values });
  return app.inject({
    method: "GET",
    url: `/api/chat/conversations/${id}/${endpoint}?${params}`,
    headers: who ? { authorization: `Bearer ${who.token}` } : {},
  });
};

async function walk(id, endpoint = "messages", who = me, start, kind) {
  let cursor = start;
  const pages = [];
  for (let i = 0; i < 20; i++) {
    const response = await request(id, endpoint, who, {
      ...(cursor ? { before: cursor } : {}),
      ...(kind ? { kind } : {}),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.ok(Array.isArray(body.items));
    pages.push(body.items);
    const more = endpoint === "messages"
      ? body.hasMore
      : body.nextCursor !== null;
    cursor = endpoint === "messages" ? body.nextBefore : body.nextCursor;
    if (!more) {
      return {
        items: endpoint === "messages"
          ? [...pages].reverse().flat()
          : pages.flat(),
        sizes: pages.map(page => page.length),
      };
    }
    assert.equal(typeof cursor, "string");
    assert.ok(cursor.startsWith("h1."), "API must return the composite cursor");
  }
  throw new Error("Pagination did not terminate");
}

async function expected(id, endpoint = "messages", kind) {
  const rows = await query(
    `SELECT id FROM messages
     WHERE conversation_id=$1 AND deleted_at IS NULL
       AND ($2::boolean=false OR kind::text IN ('image','video'))
       AND ($3::text IS NULL OR kind::text=$3)
     ORDER BY created_at ASC,id ASC`,
    [id, endpoint === "media", kind ?? null]
  );
  return endpoint === "messages"
    ? rows.map(row => row.id)
    : rows.reverse().map(row => row.id);
}

function checkIds(actual, wanted) {
  assert.deepEqual(actual.items.map(row => row.id), wanted);
  assert.equal(new Set(actual.items.map(row => row.id)).size, wanted.length);
}

try {
  await test("history and gallery against isolated PostgreSQL/Fastify", async t => {
    me = await makeUser();
    peer = await makeUser();
    outsider = await makeUser();

    await t.test("all source migrations applied in the test database", async () => {
      const row = await queryOne("SELECT count(*)::int AS n FROM schema_migrations");
      const files = readdirSync(path.join(work, "server/migrations"))
        .filter(name => name.endsWith(".sql"));
      assert.equal(row.n, files.length);
    });

    for (const count of [0, 1, 49, 50, 51, 120]) {
      await t.test(`history: ${count} rows with identical timestamp`, async () => {
        const id = await seed(count);
        const actual = await walk(id);
        checkIds(actual, await expected(id));
        if (count === 120) assert.deepEqual(actual.sizes, [50, 50, 20]);
        if (count === 51) assert.deepEqual(actual.sizes, [50, 1]);
      });
    }

    await t.test("history: PostgreSQL microseconds are preserved across pages", async () => {
      const id = await seed(120, "text", true);
      checkIds(await walk(id), await expected(id));
    });

    await t.test("gallery: identical timestamp and image/video filters", async () => {
      const id = await seed(120, "mixed");
      const all = await walk(id, "media");
      checkIds(all, await expected(id, "media"));
      assert.deepEqual(all.sizes, [50, 50, 20]);
      for (const kind of ["image", "video"]) {
        const actual = await walk(id, "media", me, undefined, kind);
        checkIds(actual, await expected(id, "media", kind));
        assert.deepEqual(actual.sizes, [50, 10]);
      }
    });

    await t.test("gallery: PostgreSQL microseconds are preserved", async () => {
      const id = await seed(120, "mixed", true);
      checkIds(await walk(id, "media"), await expected(id, "media"));
    });

    await t.test("soft-deleted records stay out of history and gallery", async () => {
      const id = await seed(51, "mixed");
      await query(
        "UPDATE messages SET deleted_at=now() WHERE id=(SELECT id FROM messages WHERE conversation_id=$1 LIMIT 1)",
        [id]
      );
      checkIds(await walk(id), await expected(id));
      checkIds(await walk(id, "media"), await expected(id, "media"));
    });

    await t.test("deleting the cursor boundary does not lose older messages", async () => {
      const id = await seed(120);
      const wanted = await expected(id);
      const first = await request(id, "messages");
      assert.equal(first.statusCode, 200, first.body);
      const body = first.json();
      const boundary = body.items[0].id;
      await query("UPDATE messages SET deleted_at=now() WHERE id=$1", [boundary]);
      checkIds(
        await walk(id, "messages", me, body.nextBefore),
        wanted.slice(0, 70)
      );
    });

    await t.test("newer insert between requests does not disturb older pages", async () => {
      const id = await seed(120);
      const wanted = await expected(id);
      const first = await request(id, "messages");
      assert.equal(first.statusCode, 200, first.body);
      const cursor = first.json().nextBefore;
      await query(
        "INSERT INTO messages(conversation_id,author_id,text,created_at) VALUES($1,$2,'new fixture','2026-11-02T12:00:00Z')",
        [id, peer.id]
      );
      checkIds(
        await walk(id, "messages", me, cursor),
        wanted.slice(0, 70)
      );
    });

    await t.test("cleared_at changes only the clearing user's history", async () => {
      const id = await seed(120, "text", true);
      await query(
        "UPDATE conversation_participants SET cleared_at=$3::timestamptz+interval '60 microseconds' WHERE conversation_id=$1 AND user_id=$2",
        [id, me.id, baseTime]
      );
      const mine = await walk(id);
      assert.equal(mine.items.length, 60);
      assert.deepEqual(
        mine.items.map(row => row.id),
        (await expected(id)).slice(60)
      );
      checkIds(await walk(id, "messages", peer), await expected(id));
    });

    await t.test("legacy ISO cursor remains accepted", async () => {
      const id = await seed(3, "mixed");
      for (const endpoint of ["messages", "media"]) {
        const response = await request(id, endpoint, me, {
          before: "2026-11-02T15:00:00+03:00",
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().items.length, 3);
      }
    });

    await t.test("history and gallery reject guests, outsiders and invalid cursors", async () => {
      const id = await seed(1, "mixed");
      for (const endpoint of ["messages", "media"]) {
        assert.equal((await request(id, endpoint, null)).statusCode, 401);
        assert.equal((await request(id, endpoint, outsider)).statusCode, 403);
        assert.equal(
          (await request(id, endpoint, me, { before: "h1.not-valid-json" })).statusCode,
          400
        );
      }
    });
  });
} finally {
  await app.close();
  await pool.end();
}
