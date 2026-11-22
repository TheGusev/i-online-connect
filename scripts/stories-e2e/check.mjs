import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const sandbox = fs.realpathSync(process.env.YA_SANDBOX);
const out = process.env.YA_OUT;
assert.match(sandbox, /^\/tmp\/ya-stories-db\.[A-Za-z0-9]+$/);
assert.equal(fs.statSync(sandbox).mode & 0o777, 0o700);

const require = createRequire(path.join(root, "server/package.json"));
const pg = require("pg");
const Fastify = require("fastify");
const multipart = require("@fastify/multipart");
const rateLimit = require("@fastify/rate-limit");

const socket = path.join(sandbox, "socket");
const config = {
  host: socket, port: 55448, user: "stories_test_owner",
  database: "postgres", ssl: false, connectionTimeoutMillis: 5000,
};
let setup, pool, app;
let completed = false;
let failure = "";
let lastServerError = "";
const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (error) {
    checks.push({ name, status: "FAIL", error: error.message });
    throw error;
  }
}
async function expect(name, promise, code) {
  const response = await promise;
  await check(name, () => assert.equal(
    response.statusCode, code,
    `${response.statusCode}: ${response.body.slice(0, 500)} ${lastServerError}`,
  ));
  return response;
}

try {
  setup = new pg.Client(config);
  await setup.connect();
  await check("database is the private cluster, with no TCP connection", async () => {
    const location = (await setup.query("SHOW data_directory")).rows[0].data_directory;
    assert.equal(fs.realpathSync(location), path.join(sandbox, "data"));
    assert.equal((await setup.query("SELECT inet_server_addr() AS address")).rows[0].address, null);
    assert.equal((await setup.query("SHOW listen_addresses")).rows[0].listen_addresses, "");
  });
  await setup.query("CREATE DATABASE stories_integration");
  await setup.end();
  setup = new pg.Client({ ...config, database: "stories_integration" });
  await setup.connect();

  const migrations = fs.readdirSync(path.join(root, "server/migrations"))
    .filter(name => /^\d+.*\.sql$/.test(name)).sort();
  assert.equal(migrations.length, 48);
  assert.equal(migrations.at(-1), "048_stories.sql");
  await setup.query("CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const name of migrations) {
    await setup.query("BEGIN");
    try {
      await setup.query(fs.readFileSync(path.join(root, "server/migrations", name), "utf8"));
      await setup.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      await setup.query("COMMIT");
    } catch (error) {
      await setup.query("ROLLBACK");
      throw new Error(`Isolated migration ${name}: ${error.message}`);
    }
  }
  console.log("ISOLATED_MIGRATIONS_APPLIED", migrations.length);
  await setup.end();
  setup = undefined;

  const database = new URL("postgresql://stories_test_owner@localhost/stories_integration");
  database.searchParams.set("host", socket);
  database.searchParams.set("port", "55448");
  process.env.DATABASE_URL = database.toString();
  process.env.NODE_ENV = "test";
  process.env.JWT_ACCESS_SECRET = randomBytes(48).toString("hex");
  process.env.JWT_REFRESH_SECRET = randomBytes(48).toString("hex");
  process.env.MEDIA_DIR = path.join(sandbox, "media");
  process.env.VERIFICATION_DIR = path.join(sandbox, "verification");
  process.env.PUBLIC_BASE_URL = "http://stories.test";
  process.env.PG_POOL_MAX = "3";
  process.env.REDIS_HOST = "";
  process.env.REGIONAL_DEMO_ENABLED = "false";

  const probe = new pg.Client({ connectionString: process.env.DATABASE_URL });
  assert.equal(probe.connectionParameters.host, socket);
  assert.equal(probe.connectionParameters.database, "stories_integration");

  const load = file => import(pathToFileURL(path.join(root, file)).href);
  const db = await load("server/src/db.ts");
  pool = db.pool;
  assert.equal((await pool.query("SELECT inet_server_addr() AS address")).rows[0].address, null);
  assert.equal(
    fs.realpathSync((await pool.query("SHOW data_directory")).rows[0].data_directory),
    path.join(sandbox, "data"),
  );

  const { signAccessToken, rateLimitSubject } = await load("server/src/auth/tokens.ts");
  const { registerErrorHandler } = await load("server/src/http.ts");
  const { storyRoutes } = await load("server/src/routes/stories.ts");

  app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.addHook("onError", async (_request, _reply, error) => {
    if (!error.statusCode || error.statusCode >= 500) lastServerError = error.message;
  });
  await app.register(multipart, {
    limits: { fileSize: 40 * 1024 * 1024, files: 1, fields: 5 },
  });
  await app.register(rateLimit, {
    max: 1000, timeWindow: "1 hour",
    keyGenerator: request => rateLimitSubject(request.headers.authorization, request.ip),
  });
  await app.register(storyRoutes, { prefix: "/api/stories" });
  await app.ready();

  const ids = Object.fromEntries(["A", "B", "C", "D", "E", "S", "Q"].map(name => [name, randomUUID()]));
  const tokens = {};
  for (const [name, id] of Object.entries(ids)) {
    await pool.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
      [id, `stories-${id}@example.invalid`, "isolated-test-not-a-login-password"],
    );
    await pool.query(
      "INSERT INTO profiles(user_id,name,age,is_seed) VALUES($1,$2,22,$3)",
      [id, `Isolated ${name}`, name === "S"],
    );
    tokens[name] = await signAccessToken(id);
  }
  async function chat(names) {
    const id = (await pool.query("INSERT INTO conversations DEFAULT VALUES RETURNING id")).rows[0].id;
    for (const name of names) {
      await pool.query(
        "INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)",
        [id, ids[name]],
      );
    }
    return id;
  }
  const directAB = await chat(["A", "B"]);
  await chat(["A", "C", "D"]);
  await chat(["A", "S"]);
  const noteId = randomUUID();
  await pool.query(
    "INSERT INTO conversations(id,notes_owner_id,notes_title,notes_request_id) VALUES($1,$2,'Private note',$3)",
    [noteId, ids.A, randomUUID()],
  );
  await pool.query(
    "INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)",
    [noteId, ids.A],
  );

  const fixture = path.join(sandbox, "fixtures");
  fs.mkdirSync(fixture);
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  function generate(args) {
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...args], {
      timeout: 30000, stdio: ["ignore", "pipe", "pipe"],
    });
  }
  generate([
    "-f", "lavfi", "-i", "color=c=blue:s=64x96",
    "-frames:v", "1", "-threads", "1", path.join(fixture, "photo.jpg"),
  ]);
  for (const [name, duration] of [["short", "1.2"], ["long", "31"]]) {
    generate([
      "-f", "lavfi", "-i", "color=c=red:s=64x96:r=10", "-t", duration,
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1",
      path.join(fixture, `${name}.mp4`),
    ]);
  }
  const photo = fs.readFileSync(path.join(fixture, "photo.jpg"));
  const short = fs.readFileSync(path.join(fixture, "short.mp4"));
  const long = fs.readFileSync(path.join(fixture, "long.mp4"));

  function send(method, url, who, options = {}) {
    lastServerError = "";
    return app.inject({
      method, url,
      ...options,
      headers: {
        ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}),
        ...options.headers,
      },
    });
  }
  function publish(who, data, clientId = randomUUID(), caption = "Test story") {
    const boundary = `stories-${randomUUID()}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="clientTempId"\r\n\r\n${clientId}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      data, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return send("POST", "/api/stories/", who, {
      payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
  }
  const feed = who => send("GET", "/api/stories/", who);
  const media = (id, who, headers = {}) =>
    send("GET", `/api/stories/${id}/media`, who, { headers });

  await expect("guest cannot list stories", feed(), 401);
  await expect("invalid access token rejected",
    send("GET", "/api/stories/", null, { headers: { authorization: "Bearer invalid" } }), 401);
  await expect("seed account cannot use stories", feed("S"), 403);

  const clientId = randomUUID();
  const first = (await expect("publish a real photo", publish("A", photo, clientId), 200)).json();
  assert.equal(first.created, true);
  const storyId = first.id;
  const repeated = (await expect("retry same publication", publish("A", photo, clientId), 200)).json();
  await check("retry returns original story without a duplicate", async () => {
    assert.equal(repeated.id, storyId);
    assert.equal(repeated.created, false);
    assert.equal((await pool.query(
      "SELECT count(*)::int AS count FROM story_posts WHERE author_id=$1", [ids.A],
    )).rows[0].count, 1);
  });
  await expect("changed content cannot reuse publication ID",
    publish("A", photo, clientId, "Changed caption"), 409);

  await check("audience includes direct contact only, not group or seed accounts", async () => {
    const rows = (await pool.query(
      "SELECT user_id FROM story_audience WHERE story_id=$1 ORDER BY user_id", [storyId],
    )).rows;
    assert.deepEqual(rows.map(row => row.user_id), [ids.B]);
  });
  await check("contact sees the story and unread count", async () => {
    const result = (await expect("contact feed", feed("B"), 200)).json();
    assert(result.items.some(item => item.id === storyId));
    assert.equal(result.unseenCount, 1);
    assert(!("file_key" in result.items[0]));
  });
  for (const who of ["C", "D", "E"]) {
    await check(`non-contact ${who} receives no story`, async () => {
      assert.equal((await expect(`${who} feed`, feed(who), 200)).json().items.length, 0);
    });
    await expect(`non-contact ${who} cannot fetch media`, media(storyId, who), 404);
  }
  await expect("guest cannot fetch media", media(storyId), 401);
  await expect("token in URL does not authorize media",
    send("GET", `/api/stories/${storyId}/media?token=${encodeURIComponent(tokens.B)}`), 401);
  const downloaded = await expect("contact can fetch protected photo", media(storyId, "B"), 200);
  await check("protected photo has private cache policy and valid bytes", () => {
    assert.match(downloaded.headers["cache-control"], /no-store/);
    assert.match(downloaded.headers["content-type"], /^image\/jpeg/);
    assert(Buffer.from(downloaded.rawPayload).length > 0);
  });
  await check("media file is outside public media directory with private permissions", async () => {
    const row = (await pool.query("SELECT file_key FROM story_posts WHERE id=$1", [storyId])).rows[0];
    const directory = process.env.MEDIA_DIR + "-stories";
    assert(path.relative(process.env.MEDIA_DIR, directory).startsWith(".."));
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(directory, row.file_key)).mode & 0o777, 0o600);
  });
  const ranged = await expect("media supports byte ranges",
    media(storyId, "B", { range: "bytes=0-15" }), 206);
  await check("byte-range response contains exactly requested bytes", () => {
    assert.equal(ranged.rawPayload.length, 16);
    assert(Buffer.from(ranged.rawPayload).equals(Buffer.from(downloaded.rawPayload).subarray(0, 16)));
  });
  await expect("invalid byte range rejected",
    media(storyId, "B", { range: "bytes=999999999-" }), 416);

  await expect("contact can record a view",
    send("POST", `/api/stories/${storyId}/view`, "B"), 200);
  await expect("repeated view is idempotent",
    send("POST", `/api/stories/${storyId}/view`, "B"), 200);
  await check("one view recorded and unread count cleared", async () => {
    assert.equal((await pool.query(
      "SELECT count(*)::int AS count FROM story_views WHERE story_id=$1 AND user_id=$2",
      [storyId, ids.B],
    )).rows[0].count, 1);
    assert.equal((await feed("B")).json().unseenCount, 0);
    const own = (await feed("A")).json().items.find(item => item.id === storyId);
    assert.equal(own.viewCount, 1);
  });
  await expect("outsider cannot record a view",
    send("POST", `/api/stories/${storyId}/view`, "C"), 404);
  await expect("contact cannot delete author's story",
    send("DELETE", `/api/stories/${storyId}`, "B"), 404);

  for (const [from, to] of [["A", "B"], ["B", "A"]]) {
    await pool.query("INSERT INTO blocks(user_id,blocked_id) VALUES($1,$2)", [ids[from], ids[to]]);
    await expect(`block ${from}->${to} immediately denies media`, media(storyId, "B"), 404);
    await check(`block ${from}->${to} removes story from feed`, async () => {
      assert(!(await feed("B")).json().items.some(item => item.id === storyId));
    });
    await pool.query("DELETE FROM blocks WHERE user_id=$1 AND blocked_id=$2", [ids[from], ids[to]]);
  }
  await pool.query(
    "DELETE FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2",
    [directAB, ids.B],
  );
  await expect("loss of direct chat revokes media access", media(storyId, "B"), 404);
  await pool.query(
    "INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)",
    [directAB, ids.B],
  );

  for (const field of ["paused_at", "blocked_at", "deleted_at"]) {
    await pool.query(`UPDATE users SET ${field}=now() WHERE id=$1`, [ids.A]);
    await expect(`author ${field} revokes media`, media(storyId, "B"), 404);
    await pool.query(`UPDATE users SET ${field}=NULL WHERE id=$1`, [ids.A]);
    await pool.query(`UPDATE users SET ${field}=now() WHERE id=$1`, [ids.B]);
    await expect(`viewer ${field} cannot use stories`, feed("B"), 403);
    await pool.query(`UPDATE users SET ${field}=NULL WHERE id=$1`, [ids.B]);
  }

  await expect("fake image contents rejected", publish("A", Buffer.alloc(128, 77)), 400);
  await expect("caption longer than 280 rejected", publish("A", photo, randomUUID(), "x".repeat(281)), 400);
  await expect("video longer than 30 seconds rejected", publish("A", long), 400);
  const videoId = (await expect("publish and normalize a real video", publish("A", short), 200)).json().id;
  const videoResponse = await expect("contact receives normalized video", media(videoId, "B"), 200);
  await check("video is returned as MP4", () => {
    assert.match(videoResponse.headers["content-type"], /^video\/mp4/);
    assert.equal(Buffer.from(videoResponse.rawPayload).subarray(4, 8).toString(), "ftyp");
  });

  await chat(["A", "E"]);
  await check("new contact cannot see stories published before contact existed", async () => {
    assert.equal((await feed("E")).json().items.length, 0);
  });
  const newStory = (await expect("publish after new contact exists", publish("A", photo), 200)).json().id;
  await check("new contact sees only the new story", async () => {
    assert.deepEqual((await feed("E")).json().items.map(item => item.id), [newStory]);
  });

  await expect("author deletes own story", send("DELETE", `/api/stories/${storyId}`, "A"), 200);
  await expect("deleted story media denied to contact", media(storyId, "B"), 404);
  await expect("deleted story media denied to author", media(storyId, "A"), 404);
  await pool.query(
    "UPDATE story_posts SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE id=$1",
    [videoId],
  );
  await expect("expired video media denied", media(videoId, "B"), 404);
  await check("expired video excluded from feed", async () => {
    assert(!(await feed("B")).json().items.some(item => item.id === videoId));
  });

  await pool.query(
    `INSERT INTO story_posts
       (author_id,client_temp_id,source_hash,kind,file_key,mime,file_size)
     SELECT $1,gen_random_uuid(),repeat('0',64),'image',
       gen_random_uuid()::text||'.jpg','image/jpeg',1
     FROM generate_series(1,7)`,
    [ids.Q],
  );
  const eighth = (await expect("eighth daily story allowed", publish("Q", photo), 200)).json().id;
  await expect("delete eighth daily story", send("DELETE", `/api/stories/${eighth}`, "Q"), 200);
  await expect("deleting story does not bypass daily quota", publish("Q", photo), 429);

  const paginationIds = (await pool.query(
    `INSERT INTO story_posts
       (author_id,client_temp_id,source_hash,kind,file_key,mime,file_size,created_at)
     SELECT $1,gen_random_uuid(),repeat('0',64),'image',
       gen_random_uuid()::text||'.jpg','image/jpeg',1,
       now()-(g*interval '1 millisecond')
     FROM generate_series(1,101) AS g RETURNING id`,
    [ids.A],
  )).rows.map(row => row.id);
  await pool.query(
    "INSERT INTO story_audience(story_id,user_id) SELECT unnest($1::uuid[]),$2",
    [paginationIds, ids.B],
  );
  await check("pagination preserves all IDs without duplicates", async () => {
    const one = (await feed("B")).json();
    assert.equal(one.items.length, 100);
    assert(one.nextCursor);
    const cursor = new URLSearchParams({
      beforeAt: one.nextCursor.at, beforeId: one.nextCursor.id,
    });
    const two = (await expect("second cursor page",
      send("GET", `/api/stories/?${cursor}`, "B"), 200)).json();
    const combined = [...one.items, ...two.items].map(item => item.id);
    assert.equal(combined.length, 102);
    assert.equal(new Set(combined).size, 102);
    assert.equal(one.unseenCount, 102);
    assert.equal(two.nextCursor, null);
  });
  await expect("invalid pagination cursor rejected",
    send("GET", `/api/stories/?beforeAt=bad&beforeId=${randomUUID()}`, "B"), 400);


  console.log("=== LIVE_BROWSER_PHASE ===");
  await app.close();
  app = Fastify({
    logger: false,
    https: {
      key: fs.readFileSync(path.join(process.env.YA_TLS_DIR, "key.pem")),
      cert: fs.readFileSync(path.join(process.env.YA_TLS_DIR, "cert.pem")),
    },
  });
  registerErrorHandler(app);
  await app.register(require("@fastify/cors"), {
    origin: (origin, callback) => callback(
      null, !origin || origin === process.env.YA_STORIES_HTTPS_ORIGIN,
    ),
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("Access-Control-Allow-Private-Network", "true");
    if (request.method === "POST" &&
        request.url === "/api/stories/" &&
        reply.statusCode === 200) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return payload;
  });
  await app.register(multipart, {
    limits: { fileSize: 40 * 1024 * 1024, files: 1, fields: 5 },
  });
  await app.register(rateLimit, {
    max: 1000, timeWindow: "1 hour",
    keyGenerator: request => rateLimitSubject(request.headers.authorization, request.ip),
  });
  await app.register(storyRoutes, { prefix: "/api/stories" });
  await app.ready();
  const localAddress = new URL(await app.listen({ host: "127.0.0.1", port: 0 }));
  assert.equal(localAddress.hostname, "127.0.0.1");
  process.env.YA_STORIES_HTTPS_ORIGIN = localAddress.origin;
  console.log("BROWSER_API_HTTPS_LOOPBACK_ONLY", localAddress.origin);

  process.env.YA_BROWSER_ME = ids.A;
  process.env.YA_BROWSER_PEER = ids.B;
  process.env.YA_BROWSER_TOKEN = tokens.A;
  process.env.YA_BROWSER_FIXTURES = fixture;
  globalThis.__STORIES_BROWSER_BRIDGE__ = options => app.inject(options);
  globalThis.__STORIES_BROWSER_RESET__ = async mode => {
    await pool.query("DELETE FROM story_posts");
    if (!mode.startsWith("stories-guest")) {
      const response = await publish("B", photo);
      assert.equal(response.statusCode, 200, response.body);
    }
  };
  globalThis.__STORIES_BROWSER_VIEWCOUNT__ = async () => {
    const row = (await pool.query(
      "SELECT count(*)::int AS count FROM story_views WHERE user_id=$1", [ids.A],
    )).rows[0];
    return row.count === 1;
  };
  globalThis.__STORIES_BROWSER_INSPECT__ = async caption => (await pool.query(
    "SELECT id,kind,deleted_at FROM story_posts WHERE author_id=$1 AND caption=$2",
    [ids.A, caption],
  )).rows;

  const browserOut = path.join(out, "browser");
  fs.mkdirSync(browserOut);
  const savedArguments = process.argv;
  try {
    process.argv = [
      process.execPath, process.env.YA_BROWSER_FILE,
      path.join(root, "dist/static"), browserOut,
    ];
    await check("live browser scenarios with actual stories API", async () => {
      await import(pathToFileURL(process.env.YA_BROWSER_FILE).href);
    });
  } finally {
    process.argv = savedArguments;
    delete globalThis.__STORIES_BROWSER_BRIDGE__;
    delete globalThis.__STORIES_BROWSER_RESET__;
    delete globalThis.__STORIES_BROWSER_VIEWCOUNT__;
    delete globalThis.__STORIES_BROWSER_INSPECT__;
  }

  completed = true;
} catch (error) {
  failure = error.stack || String(error);
  console.error("ISOLATED_TEST_FAILURE", failure);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(error => {
    completed = false; process.exitCode = 1;
    console.error("APP_CLOSE_ERROR", error.message);
  });
  if (pool) await pool.end();
  if (setup) await setup.end().catch(() => {});
  const summary = {
    status: completed ? "PASS" : "FAIL",
    passed: checks.filter(item => item.status === "PASS").length,
    failed: checks.filter(item => item.status === "FAIL").length,
    checks, ...(failure ? { failure } : {}),
  };
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(summary, null, 2));
  console.log("STORIES_ISOLATED_RESULT", JSON.stringify({
    status: summary.status, passed: summary.passed, failed: summary.failed,
  }));
}
