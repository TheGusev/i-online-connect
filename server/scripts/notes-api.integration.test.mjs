import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const target = new URL(process.env.DATABASE_URL || "postgres://invalid/");
const socket = process.env.NOTES_PG_SOCKET || "";
const localTarget =
  target.pathname === "/notes_ci" &&
  target.username === "notes_test" &&
  target.hostname === "localhost" &&
  target.port === "55447" &&
  /^\/tmp\/ya-notes-pg-[A-Za-z0-9]+\/socket$/.test(socket) &&
  target.searchParams.get("host") === socket;

const ciTarget =
  process.env.GITHUB_ACTIONS === "true" &&
  target.hostname === "127.0.0.1" &&
  target.port === "5432" &&
  target.username === "audit" &&
  target.pathname === "/notes_api_ci" &&
  !target.searchParams.has("host");

if (process.env.NODE_ENV !== "test" || !(localTarget || ciTarget)) {
  throw new Error("Requires an approved isolated notes test database");
}

const { pool, query, queryOne } = await import("../src/db.ts");
const { signAccessToken } = await import("../src/auth/tokens.ts");
const { registerErrorHandler } = await import("../src/http.ts");
const { chatRoutes } = await import("../src/routes/chat.ts");

const app = (await import("fastify")).default();
registerErrorHandler(app);
await app.register((await import("@fastify/cookie")).default);
await app.register((await import("@fastify/multipart")).default);
await app.register(chatRoutes, { prefix: "/api/chat" });

async function user(name) {
  const id = randomUUID();
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')",
    [id, `${id}@notes.example.invalid`],
  );
  await query(
    "INSERT INTO profiles(user_id,name,city,age) VALUES($1,$2,'Тест',25)",
    [id, name],
  );
  await query(
    "INSERT INTO privacy_settings(user_id,who_can_message) VALUES($1,'everyone')",
    [id],
  );
  return { id, token: await signAccessToken(id) };
}

const headers = who => who
  ? { authorization: `Bearer ${who.token}` }
  : {};

async function call(method, url, who, payload) {
  return app.inject({
    method,
    url,
    headers: headers(who),
    ...(payload === undefined ? {} : { payload }),
  });
}

function ok(response) {
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

try {
  await test("private note chats: real API and PostgreSQL", async t => {
    const owner = await user("Владелец");
    const outsider = await user("Другой");
    let id;
    let messageId;
    const requestId = randomUUID();

    await t.test("anonymous creation is rejected", async () => {
      const r = await call("POST", "/api/chat/notes", null, {
        title: "Личное", clientTempId: randomUUID(),
      });
      assert.equal(r.statusCode, 401, r.body);
    });

    await t.test("empty title is rejected", async () => {
      const r = await call("POST", "/api/chat/notes", owner, {
        title: "   ", clientTempId: randomUUID(),
      });
      assert.equal(r.statusCode, 400, r.body);
    });

    await t.test("concurrent retries create exactly one empty chat", async () => {
      const responses = await Promise.all([
        call("POST", "/api/chat/notes", owner, {
          title: "Идеи", clientTempId: requestId,
        }),
        call("POST", "/api/chat/notes", owner, {
          title: "Идеи", clientTempId: requestId,
        }),
      ]);
      const results = responses.map(ok);
      id = results[0].conversationId;
      assert.equal(results[1].conversationId, id);
      const row = await queryOne(
        `SELECT
           (SELECT count(*)::int FROM messages WHERE conversation_id=$1) AS messages,
           (SELECT count(*)::int FROM conversation_participants
             WHERE conversation_id=$1) AS participants`,
        [id],
      );
      assert.equal(row.messages, 0);
      assert.equal(row.participants, 1);
    });

    await t.test("empty notes appear in the list and open without a peer", async () => {
      const list = ok(await call("GET", "/api/chat/conversations", owner));
      const item = list.find(x => x.id === id);
      assert.ok(item);
      assert.equal(item.kind, "notes");
      assert.equal(item.participant.name, "Идеи");
      assert.equal(item.participant.online, false);
      assert.equal(item.unreadCount, 0);
      assert.equal(item.awaitingReply, false);
      const detail = ok(await call(
        "GET", `/api/chat/conversations/${id}`, owner,
      ));
      assert.equal(detail.kind, "notes");
      const history = ok(await call(
        "GET", `/api/chat/conversations/${id}/messages`, owner,
      ));
      assert.deepEqual(history.items, []);
    });

    await t.test("other accounts cannot list, read, write or rename notes", async () => {
      const list = ok(await call("GET", "/api/chat/conversations", outsider));
      assert.equal(list.some(x => x.id === id), false);
      for (const suffix of ["", "/messages", "/media"]) {
        const r = await call(
          "GET", `/api/chat/conversations/${id}${suffix}`, outsider,
        );
        assert.equal(r.statusCode, 403, r.body);
      }
      const send = await call(
        "POST", `/api/chat/conversations/${id}/messages`, outsider,
        { text: "Чужая запись", clientTempId: randomUUID() },
      );
      assert.equal(send.statusCode, 403, send.body);
      const rename = await call(
        "PATCH", `/api/chat/notes/${id}`, outsider, { title: "Чужое" },
      );
      assert.equal(rename.statusCode, 404, rename.body);
    });

    await t.test("database rejects another participant and ownership changes", async () => {
      await assert.rejects(
        query(
          "INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)",
          [id, outsider.id],
        ),
        /only to its owner/,
      );
      await assert.rejects(
        query("UPDATE conversations SET notes_owner_id=$2 WHERE id=$1",
          [id, outsider.id]),
        /immutable/,
      );
    });

    await t.test("owner saves a text note and retry does not duplicate it", async () => {
      const clientTempId = randomUUID();
      const first = ok(await call(
        "POST", `/api/chat/conversations/${id}/messages`, owner,
        { text: "Проверить компактный интерфейс", clientTempId },
      ));
      messageId = first.id;
      const again = ok(await call(
        "POST", `/api/chat/conversations/${id}/messages`, owner,
        { text: "Проверить компактный интерфейс", clientTempId },
      ));
      assert.equal(again.id, messageId);
      const history = ok(await call(
        "GET", `/api/chat/conversations/${id}/messages`, owner,
      ));
      assert.equal(history.items.length, 1);
      assert.equal(history.items[0].text, "Проверить компактный интерфейс");
      assert.equal(history.items[0].authorId, owner.id);
    });

    await t.test("saved notes never become unanswered or unread", async () => {
      const list = ok(await call("GET", "/api/chat/conversations", owner));
      const item = list.find(x => x.id === id);
      assert.equal(item.unreadCount, 0);
      assert.equal(item.awaitingReply, false);
      const unread = ok(await call("GET", "/api/chat/unread-count", owner));
      assert.equal(unread.count, 0);
      await new Promise(resolve => setTimeout(resolve, 50));
      const row = await queryOne("SELECT count(*)::int AS n FROM notifications");
      assert.equal(row.n, 0);
    });

    await t.test("rename persists and owner can create multiple note chats", async () => {
      ok(await call(
        "PATCH", `/api/chat/notes/${id}`, owner, { title: "Рабочие идеи" },
      ));
      const detail = ok(await call(
        "GET", `/api/chat/conversations/${id}`, owner,
      ));
      assert.equal(detail.participant.name, "Рабочие идеи");
      const second = ok(await call("POST", "/api/chat/notes", owner, {
        title: "Покупки", clientTempId: randomUUID(),
      }));
      assert.notEqual(second.conversationId, id);
      const list = ok(await call("GET", "/api/chat/conversations", owner));
      assert.equal(list.filter(x => x.kind === "notes").length, 2);
    });

    await t.test("outsider cannot edit or delete an owner's note", async () => {
      const edit = await call(
        "PATCH", `/api/chat/conversations/${id}/messages/${messageId}`,
        outsider, { text: "Подмена" },
      );
      assert.equal(edit.statusCode, 403, edit.body);
      const remove = await call(
        "DELETE", `/api/chat/conversations/${id}/messages/${messageId}`,
        outsider,
      );
      assert.equal(remove.statusCode, 403, remove.body);
    });

    await t.test("regular two-person chats still create and receive messages", async () => {
      const opened = ok(await call(
        "POST", "/api/chat/conversations", owner,
        { participantId: outsider.id },
      ));
      assert.notEqual(opened.conversationId, id);
      const sent = ok(await call(
        "POST", `/api/chat/conversations/${opened.conversationId}/messages`,
        owner, { text: "Обычный чат работает", clientTempId: randomUUID() },
      ));
      const history = ok(await call(
        "GET", `/api/chat/conversations/${opened.conversationId}/messages`,
        outsider,
      ));
      assert.ok(history.items.some(x => x.id === sent.id));
      const detail = ok(await call(
        "GET", `/api/chat/conversations/${opened.conversationId}`, owner,
      ));
      assert.equal(detail.kind, "direct");
      assert.equal(detail.participant.id, outsider.id);
    });
  });
} finally {
  await app.close();
  await pool.end();
}
