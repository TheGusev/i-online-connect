import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.DATABASE_URL || "postgres://localhost/invalid");
if (
  process.env.NODE_ENV !== "test" ||
  url.pathname !== "/geo_routes_ci" ||
  url.hostname !== "127.0.0.1"
) throw new Error("Isolated geo_routes_ci required");

const { pool } = await import("../src/db.ts");
const { spaceRoutes } = await import("../src/routes/spaces.ts");
const { signAccessToken } = await import("../src/auth/tokens.ts");
const { default: Fastify } = await import("fastify");

test("regional discovery preserves authorization and membership", async t => {
  const app = Fastify({ logger: false });
  const viewer = randomUUID();
  const host = randomUUID();
  const createdSpaces = [];
  let foreignSeed;

  try {
    const fixture = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM spaces WHERE region_id='audit-a' AND is_seed) AS a,
        (SELECT count(*)::int FROM spaces WHERE region_id='audit-b' AND is_seed) AS b
    `);
    assert.equal(fixture.rows[0].a, 14, "Expected previous HTTP-test fixtures");
    assert.equal(fixture.rows[0].b, 14);

    for (const [id, name] of [[viewer, "Access viewer"], [host, "Access host"]]) {
      await pool.query("INSERT INTO users(id) VALUES($1)", [id]);
      await pool.query(
        "INSERT INTO profiles(user_id,name,city,geo_place_id) VALUES($1,$2,'Тестгород a','audit-place-a')",
        [id, name]
      );
    }

    await app.register(spaceRoutes, { prefix: "/api/spaces" });
    await app.ready();
    const token = await signAccessToken(viewer);
    const req = (suffix = "/", method = "GET") => app.inject({
      method, url: "/api/spaces" + suffix,
      headers: { authorization: "Bearer " + token }
    });
    async function list() {
      const response = await req();
      assert.equal(response.statusCode, 200, response.body);
      return response.json();
    }
    async function space({ region = "audit-a", privateSpace = false, city = "Тестгород a" } = {}) {
      const id = randomUUID();
      await pool.query(`
        INSERT INTO spaces(id,title,category,host_id,is_private,region_id,city)
        VALUES($1,'Synthetic access fixture','culture',$2,$3,$4,$5)
      `, [id, host, privateSpace, region, city]);
      createdSpaces.push(id);
      return id;
    }
    async function withSpace(options, check) {
      const id = await space(options);
      try { await check(id); }
      finally { await pool.query("DELETE FROM spaces WHERE id=$1", [id]); }
    }

    await t.test("baseline shows 14 local demos", async () => {
      assert.equal((await list()).filter(x => x.isSeed).length, 14);
    });

    await t.test("foreign-region membership remains visible and leave returns no private data", async () => {
      const found = await pool.query(
        "SELECT id FROM spaces WHERE region_id='audit-b' AND is_seed ORDER BY id LIMIT 1"
      );
      foreignSeed = found.rows[0].id;
      await pool.query(
        "INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'member')",
        [foreignSeed, viewer]
      );
      assert.ok((await list()).some(x => x.id === foreignSeed));
      const leave = await req("/" + foreignSeed + "/leave", "POST");
      assert.equal(leave.statusCode, 204);
      assert.equal(leave.body, "");
      assert.ok(!(await list()).some(x => x.id === foreignSeed));
      const retry = await req("/" + foreignSeed + "/leave", "POST");
      assert.equal(retry.statusCode, 403);
    });

    await t.test("private community is hidden and does not consume a demo slot", async () => {
      await withSpace({ privateSpace: true }, async id => {
        const rows = await list();
        assert.ok(!rows.some(x => x.id === id));
        assert.equal(rows.filter(x => x.isSeed).length, 14);
        assert.equal((await req("/" + id)).statusCode, 403);
        assert.equal((await req("/" + id + "/messages")).statusCode, 403);
      });
    });

    await t.test("foreign private membership remains accessible", async () => {
      await withSpace({ region: "audit-b", privateSpace: true }, async id => {
        await pool.query(
          "INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'member')",
          [id, viewer]
        );
        assert.ok((await list()).some(x => x.id === id));
        assert.equal((await req("/" + id)).statusCode, 200);
        assert.equal((await req("/" + id + "/messages")).statusCode, 200);
      });
    });

    await t.test("foreign private invitation remains visible but grants no chat access", async () => {
      await withSpace({ region: "audit-b", privateSpace: true }, async id => {
        await pool.query(`
          INSERT INTO space_invites(space_id,inviter_id,invitee_id,status)
          VALUES($1,$2,$3,'pending')
        `, [id, host, viewer]);
        assert.ok((await list()).some(x => x.id === id));
        assert.equal((await req("/" + id)).statusCode, 200);
        assert.equal((await req("/" + id + "/messages")).statusCode, 403);
      });
    });

    await t.test("one public local community replaces one demo", async () => {
      await withSpace({}, async id => {
        const rows = await list();
        assert.ok(rows.some(x => x.id === id));
        assert.equal(rows.filter(x => x.isSeed).length, 13);
      });
    });

    await t.test("legacy community with unambiguous city is classified without updating its row", async () => {
      await withSpace({ region: null }, async id => {
        const rows = await list();
        assert.ok(rows.some(x => x.id === id));
        assert.equal(rows.filter(x => x.isSeed).length, 13);
        const saved = await pool.query("SELECT region_id FROM spaces WHERE id=$1", [id]);
        assert.equal(saved.rows[0].region_id, null);
      });
    });

    await t.test("foreign public community does not consume local demo slots", async () => {
      await withSpace({ region: "audit-b", city: "Тестгород b" }, async id => {
        const rows = await list();
        assert.ok(!rows.some(x => x.id === id));
        assert.equal(rows.filter(x => x.isSeed).length, 14);
      });
    });

    await t.test("changed profile city invalidates stale geographic confirmation", async () => {
      await pool.query("UPDATE profiles SET city='Неизвестный город' WHERE user_id=$1", [viewer]);
      try {
        assert.equal((await list()).filter(x => x.isSeed).length, 0);
      } finally {
        await pool.query("UPDATE profiles SET city='Тестгород a' WHERE user_id=$1", [viewer]);
      }
    });
  } finally {
    try {
      if (foreignSeed) await pool.query(
        "DELETE FROM space_members WHERE space_id=$1 AND user_id=$2",
        [foreignSeed, viewer]
      );
      for (const id of createdSpaces) {
        await pool.query("DELETE FROM spaces WHERE id=$1", [id]);
      }
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[viewer, host]]);
    } finally {
      await app.close();
      await pool.end();
    }
  }
});
