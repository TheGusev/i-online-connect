import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { apply, inspect, restore } from '../scripts/trust-existing-lib.mjs';

// Opt-in isolated database only. Temporary tables shadow real tables for this connection.
if (!process.env.TRUST_TEST_DATABASE_URL) throw new Error('Set TRUST_TEST_DATABASE_URL to an isolated test database');
const client = new pg.Client({ connectionString: process.env.TRUST_TEST_DATABASE_URL });
await client.connect();
try {
  await client.query(`CREATE TEMP TABLE users(id uuid PRIMARY KEY, created_at timestamptz, deleted_at timestamptz);
    CREATE TEMP TABLE profiles(user_id uuid PRIMARY KEY, trust_level trust_level, updated_at timestamptz DEFAULT now(),
      video_verified boolean DEFAULT false, safe_meetings int DEFAULT 0, clean_conversations int DEFAULT 0);
    CREATE TEMP TABLE verifications(user_id uuid, status text);
    INSERT INTO users VALUES
      ('00000000-0000-0000-0000-000000000001','2026-10-14T20:03:00Z',NULL),
      ('00000000-0000-0000-0000-000000000002','2026-10-14T20:03:01Z',NULL),
      ('00000000-0000-0000-0000-000000000003','2026-10-13T20:03:00Z',NULL),
      ('00000000-0000-0000-0000-000000000004','2026-10-13T20:03:00Z',now()),
      ('00000000-0000-0000-0000-000000000005','2026-10-13T20:03:00Z',NULL);
    INSERT INTO profiles(user_id,trust_level) SELECT id, CASE WHEN id::text LIKE '%003' THEN 'ambassador'::trust_level ELSE 'new'::trust_level END
      FROM users WHERE id::text NOT LIKE '%005';
    INSERT INTO verifications SELECT id,'pending' FROM users;`);
  const levels = async () => (await client.query('SELECT trust_level FROM profiles ORDER BY user_id')).rows.map(r => r.trust_level);
  const facts = async () => ({ profiles: (await client.query('SELECT user_id,video_verified,safe_meetings,clean_conversations FROM profiles ORDER BY user_id')).rows,
    verifications: (await client.query('SELECT * FROM verifications ORDER BY user_id')).rows });
  const originalFacts = await facts();
  let backup;
  await test('preview counts deleted accounts and missing profiles separately', async () => {
    assert.deepEqual(await inspect(client), {users:4,deleted:1,without_profile:1,to_update:2,trusted:0,ambassador:1});
  });
  await test('backup failure prevents all mutations', async () => {
    await assert.rejects(apply(client, async () => { throw new Error('disk full'); }));
    assert.deepEqual(await levels(), ['new','new','ambassador','new']);
  });
  await test('existing users including cutoff boundary receive trusted', async () => {
    assert.equal(await apply(client, async data => { backup = data; }), 2);
    assert.equal((await levels())[0], 'trusted');
  });
  await test('registrations after 2026-10-14 20:03 UTC remain new', async () => {
    assert.equal((await levels())[1], 'new');
  });
  await test('ambassador is not downgraded', async () => { assert.equal((await levels())[2], 'ambassador'); });
  await test('identity verification and behavioral facts are unchanged', async () => {
    assert.deepEqual(await facts(), originalFacts);
  });
  await test('soft-deleted users receive status without restoring account', async () => {
    assert.equal((await levels())[3], 'trusted');
    assert.ok((await client.query("SELECT deleted_at FROM users WHERE id::text LIKE '%004'")).rows[0].deleted_at);
  });
  await test('repeated assignment is idempotent', async () => {
    assert.equal(await apply(client, async () => {}), 0);
  });
  await test('backup restores exact prior timestamps and levels', async () => {
    assert.equal(await restore(client, JSON.parse(JSON.stringify(backup))), 2);
    assert.deepEqual(await levels(), ['new','new','ambassador','new']);
  });
  await test('rollback refuses to overwrite later profile changes', async () => {
    await apply(client, async data => { backup = data; });
    await client.query("UPDATE profiles SET updated_at = updated_at + interval '1 second' WHERE user_id::text LIKE '%004'");
    await assert.rejects(restore(client, backup));
    assert.equal((await levels())[0], 'trusted');
  });
} finally { await client.end(); }