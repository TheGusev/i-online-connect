import test from 'node:test';
import assert from 'node:assert/strict';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://localhost/invalid');
if (process.env.NODE_ENV !== 'test' || url.pathname !== '/geo_import_ci' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('Refusing integration tests outside localhost/geo_import_ci with NODE_ENV=test');
}
const { pool } = await import('../src/db.ts');
const { syncGeoDirectory } = await import('../src/seed/geo-directory.ts');
const realFetch = globalThis.fetch;

function checksum(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function archive(text) {
  const name = Buffer.from('RU.txt');
  const body = Buffer.from(text);
  const crc = checksum(body);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + body.length, 16);
  return Buffer.concat([local, name, body, central, name, end]);
}
function line(id, city, code = 'PPL', admin = '53') {
  return [String(id), city, city, '', '55', '83', 'P', code, 'RU', '', admin, '', '', '', '1000', '', '', 'Asia/Novosibirsk', '2026-11-16'].join('\t');
}
function fixture({ capitals = true, admin = '53', capital = 'Новосибирск' } = {}) {
  const rows = Array.from({ length: 1001 }, (_, i) => line(90000000 + i, `Тестгород ${i}`, 'PPL', admin));
  if (capitals) rows.push(line(91000000, capital, 'PPLA', admin));
  return archive(rows.join('\n'));
}
function serve(buffer) {
  globalThis.fetch = async () => new Response(buffer, { status: 200 });
}
async function resetFreshness() { await pool.query('DELETE FROM geo_directory_sync'); }
async function counts() {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*)::int FROM geo_places) AS places,
    (SELECT count(*)::int FROM demo_regions) AS regions,
    (SELECT count(*)::int FROM geo_directory_sync) AS markers`);
  return rows[0];
}

test('GeoNames importer with real PostgreSQL', async t => {
  try {
    assert.equal(checksum(Buffer.from('123456789')), 0xcbf43926);
    await resetFreshness();
    await t.test('corrupted ZIP rejected without database changes', async () => {
      const before = await counts();
      const damaged = fixture();
      damaged[38] ^= 1;
      serve(damaged);
      await assert.rejects(syncGeoDirectory(), /checksum mismatch/);
      assert.deepEqual(await counts(), before);
    });
    await t.test('zero usable regions rejected without freshness marker', async () => {
      const before = await counts();
      serve(fixture({ capitals: false }));
      await assert.rejects(syncGeoDirectory(), /No usable regional records/);
      assert.deepEqual(await counts(), before);
    });
    await t.test('valid import uses existing region and commits records', async () => {
      serve(fixture());
      await syncGeoDirectory();
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM geo_places WHERE source LIKE 'https://download.geonames.org/%' AND region_id = 'ru-nso'");
      assert.ok(rows[0].n >= 1001);
      assert.equal((await counts()).markers, 1);
    });
    await t.test('fresh import performs no network call', async () => {
      globalThis.fetch = async () => { throw new Error('unexpected network request'); };
      await syncGeoDirectory();
    });
    await t.test('stale re-import is idempotent in PostgreSQL', async () => {
      const before = await counts();
      await resetFreshness();
      serve(fixture());
      await syncGeoDirectory();
      assert.deepEqual(await counts(), before);
    });
    await t.test('simultaneous imports serialize without duplicates', async () => {
      const before = await counts();
      await resetFreshness();
      serve(fixture());
      await Promise.all([syncGeoDirectory(), syncGeoDirectory()]);
      assert.deepEqual(await counts(), before);
    });
    await t.test('SQL failure rolls back newly inserted region and marker', async () => {
      await resetFreshness();
      const before = await counts();
      await pool.query(`CREATE FUNCTION geo_ci_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced import failure'; END $$;
        CREATE TRIGGER geo_ci_reject BEFORE INSERT ON geo_places FOR EACH ROW EXECUTE FUNCTION geo_ci_reject()`);
      try {
        serve(fixture({ admin: '99', capital: 'Тестцентр' }));
        await assert.rejects(syncGeoDirectory(), /forced import failure/);
        assert.deepEqual(await counts(), before);
        const { rows } = await pool.query("SELECT id FROM demo_regions WHERE id = 'geonames:RU.99'");
        assert.equal(rows.length, 0);
      } finally {
        await pool.query('DROP TRIGGER geo_ci_reject ON geo_places; DROP FUNCTION geo_ci_reject()');
      }
    });
    if (process.env.GEO_LIVE_TEST === '1') {
      await t.test('live GeoNames archive imports into PostgreSQL', async () => {
        await resetFreshness();
        globalThis.fetch = realFetch;
        await syncGeoDirectory();
        const { rows } = await pool.query("SELECT count(*)::int AS n FROM geo_places WHERE source = 'https://download.geonames.org/export/dump/RU.zip'");
        assert.ok(rows[0].n >= 1000);
        assert.equal((await counts()).markers, 1);
      });
    }
  } finally {
    globalThis.fetch = realFetch;
    await pool.end();
  }
});
