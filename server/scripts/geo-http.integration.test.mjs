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
const { geoRoutes } = await import("../src/routes/geo.ts");
const { spaceRoutes } = await import("../src/routes/spaces.ts");
const { signAccessToken } = await import("../src/auth/tokens.ts");
const { default: Fastify } = await import("fastify");

test("geography HTTP routes and regional discovery", async t => {
  const app = Fastify({ logger: false });
  try {
    await app.register(geoRoutes, { prefix: "/api/geo" });
    await app.register(spaceRoutes, { prefix: "/api/spaces" });
    await app.ready();

    async function user(name, seed = false) {
      const id = randomUUID();
      await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [
        id, id + (seed ? "@seed.local" : "@example.invalid")
      ]);
      await pool.query(
        "INSERT INTO profiles(user_id,name,is_seed) VALUES($1,$2,$3)",
        [id, name, seed]
      );
      return id;
    }

    await user("Synthetic demo author", true);
    const a = await user("Region A user");
    const b = await user("Region B user");
    const tokens = {
      a: await signAccessToken(a),
      b: await signAccessToken(b)
    };

    for (const key of ["a", "b"]) {
      await pool.query(
        "INSERT INTO demo_regions(id,center_city) VALUES($1,$2)",
        ["audit-" + key, "Тестцентр " + key]
      );
      await pool.query(`
        INSERT INTO geo_places(id,city,normalized_name,region_id,source)
        VALUES($1,$2,$3,$4,'audit fixture')
      `, [
        "audit-place-" + key, "Тестгород " + key,
        "тестгород " + key, "audit-" + key
      ]);
    }

    const request = (who, method, path, payload) => app.inject({
      method, url: "/api" + path,
      headers: who ? { authorization: "Bearer " + tokens[who] } : {},
      ...(payload ? { payload } : {})
    });

    await t.test("anonymous cannot save city", async () => {
      const r = await request(null, "PUT", "/geo/me", {
        placeId: "audit-place-a"
      });
      assert.equal(r.statusCode, 401);
    });

    for (const who of ["a", "b"]) {
      await t.test("save confirmed city and seed region " + who, async () => {
        const r = await request(who, "PUT", "/geo/me", {
          placeId: "audit-place-" + who
        });
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(r.json().status, "resolved");
        assert.equal(r.json().demoReady, true);

        const current = await request(who, "GET", "/geo/me");
        assert.equal(current.statusCode, 200);
        assert.equal(current.json().place.id, "audit-place-" + who);

        const { rows } = await pool.query(
          "SELECT count(*)::int AS n FROM spaces WHERE region_id=$1 AND is_seed",
          ["audit-" + who]
        );
        assert.equal(rows[0].n, 14);
      });
    }

    await t.test("saving the same city creates no duplicate communities", async () => {
      const r = await request("a", "PUT", "/geo/me", {
        placeId: "audit-place-a"
      });
      assert.equal(r.statusCode, 200);
      const { rows } = await pool.query(`
        SELECT count(*)::int AS n, count(DISTINCT seed_key)::int AS unique_keys
        FROM spaces WHERE region_id='audit-a' AND is_seed
      `);
      assert.equal(rows[0].n, 14);
      assert.equal(rows[0].unique_keys, 14);
    });

    await t.test("unknown place cannot replace confirmed city", async () => {
      const r = await request("a", "PUT", "/geo/me", {
        placeId: "audit-missing"
      });
      assert.equal(r.statusCode, 404);
      const current = await request("a", "GET", "/geo/me");
      assert.equal(current.json().place.id, "audit-place-a");
    });

    for (const who of ["a", "b"]) {
      await t.test("discovery contains only own regional demos: " + who, async () => {
        const r = await request(who, "GET", "/spaces/");
        assert.equal(r.statusCode, 200, r.body);
        const items = r.json();
        assert.ok(Array.isArray(items));

        const { rows } = await pool.query(
          "SELECT id FROM spaces WHERE region_id=$1 AND is_seed",
          ["audit-" + who]
        );
        const expected = new Set(rows.map(row => row.id));
        const actual = items.filter(item => item.isSeed);
        assert.equal(actual.length, 14, "Expected 14 own-region demos");
        assert.ok(actual.every(item => expected.has(item.id)),
          "Foreign-region demo appeared in discovery");
      });
    }
  } finally {
    await app.close();
    await pool.end();
  }
});
