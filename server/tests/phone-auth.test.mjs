import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID() + randomUUID();
const suffix = String(Date.now()).slice(-7);
const testPhone = `+7999${suffix}`;
process.env.TEST_PHONES = `${testPhone}:111111`;
process.env.TEST_PHONES_ENABLED = 'true';
const { pool, query } = await import('../src/db.ts');
const { normalizePhone } = await import('../src/auth/phone.ts');
const { authRoutes } = await import('../src/routes/auth.ts');
const { listingRoutes } = await import('../src/routes/listings.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const Fastify = (await import('fastify')).default;
const app = Fastify();
registerErrorHandler(app);
await app.register((await import('@fastify/cookie')).default);
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(listingRoutes, { prefix: '/api/listings' });
const post = (url, payload, ip = '10.0.0.1') => app.inject({ method: 'POST', url, payload, remoteAddress: ip });
try {
  await test('normalizes any input format to E.164', () => {
    assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
    assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
    assert.equal(normalizePhone('9991234567'), '+79991234567');
    assert.equal(normalizePhone('+1 202 555 0100'), null); // only +7 by default
    assert.equal(normalizePhone('123'), null);
  });
  await test('bad format → 400', async () => {
    assert.equal((await post('/api/auth/phone/request', { phone: '12' })).statusCode, 400);
  });
  await test('request answers 204, second request within 60s → 429 with wait time', async () => {
    const phone = `+7988${suffix}`;
    assert.equal((await post('/api/auth/phone/request', { phone })).statusCode, 204);
    const again = await post('/api/auth/phone/request', { phone });
    assert.equal(again.statusCode, 429);
    assert.ok(again.json().retryAfter > 50);
    const row = await pool.query('SELECT code_hash FROM auth_otps WHERE phone=$1', [phone]);
    assert.equal(row.rows[0].code_hash.length, 64); // only the hash is stored
  });
  await test('5 wrong attempts burn the code', async () => {
    const phone = `+7977${suffix}`;
    await post('/api/auth/phone/request', { phone });
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/phone/verify', { phone, code: '000000' });
      assert.equal(r.statusCode, 400);
    }
    const r = await post('/api/auth/phone/verify', { phone, code: '000000' });
    assert.equal(r.json().error, 'otp_missing');
  });
  await test('expired code is rejected', async () => {
    const phone = `+7966${suffix}`;
    await post('/api/auth/phone/request', { phone });
    await query("UPDATE auth_otps SET expires_at = now() - interval '1 second' WHERE phone=$1", [phone]);
    assert.equal((await post('/api/auth/phone/verify', { phone, code: '123456' })).json().error, 'otp_expired');
  });
  await test('new number creates a user (isNew=true), second login isNew=false', async () => {
    await post('/api/auth/phone/request', { phone: testPhone });
    const first = await post('/api/auth/phone/verify', { phone: testPhone, code: '111111' });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().isNew, true);
    assert.ok(first.json().token);
    assert.match(String(first.headers['set-cookie']), /ya_refresh=/);
    assert.equal((await post('/api/auth/phone/verify', { phone: testPhone, code: '111111' })).statusCode, 400); // used
    await query("UPDATE auth_otps SET created_at = created_at - interval '1 hour' WHERE phone=$1", [testPhone]);
    await post('/api/auth/phone/request', { phone: testPhone });
    const second = await post('/api/auth/phone/verify', { phone: testPhone, code: '111111' });
    assert.equal(second.json().isNew, false);
    assert.equal(second.json().user.id, first.json().user.id);
  });
  await test('guest can list listings, but not create', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/listings' });
    assert.equal(list.statusCode, 200);
    for (const item of list.json().items) assert.deepEqual(Object.keys(item.author).sort(), ['avatarUrl', 'id', 'name', 'trustLevel']);
    assert.equal((await app.inject({ method: 'GET', url: '/api/listings/mine' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/listings', payload: {} })).statusCode, 401);
  });
} finally {
  await query('DELETE FROM users WHERE phone LIKE $1', [`%${suffix}`]);
  await query('DELETE FROM auth_otps WHERE phone LIKE $1', [`%${suffix}`]);
  await app.close(); await pool.end();
}
