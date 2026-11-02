import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://lovable@127.0.0.1:5546/chat_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID() + randomUUID();
const { pool, query, queryOne } = await import('../src/db.ts');
const { signAccessToken } = await import('../src/auth/tokens.ts');
const { chatRoutes } = await import('../src/routes/chat.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const Fastify = (await import('fastify')).default;
const app = Fastify(); registerErrorHandler(app);
await app.register(chatRoutes, { prefix: '/api/chat' });
const users = []; const conversations = [];
async function user() {
  const id = randomUUID(); users.push(id);
  await query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [id, `${id}@test.local`, 'test-hash']);
  await query("INSERT INTO profiles(user_id,name,city,age) VALUES($1,'Тест','Новосибирск',25)", [id]);
  return { id, token: await signAccessToken(id) };
}
const me = await user(); const peer = await user(); const outsider = await user();
for (let n = 0; n < 7; n++) {
  const row = await queryOne('INSERT INTO conversations DEFAULT VALUES RETURNING id'); conversations.push(row.id);
  await query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)', [row.id, me.id, peer.id]);
  await query("INSERT INTO messages(conversation_id,author_id,text,created_at) VALUES($1,$2,'Привет',$3)", [row.id, peer.id, new Date(Date.UTC(2026, 10, 2, n))]);
}
const change = (who, index, kind, method = 'PUT') => app.inject({ method, url: `/api/chat/conversations/${conversations[index]}/${kind}`, headers: { authorization: `Bearer ${who.token}` } });
const list = async (who) => (await app.inject({ method: 'GET', url: '/api/chat/conversations', headers: { authorization: `Bearer ${who.token}` } })).json();
try {
  await test('pin and repeat preserve timestamp', async () => {
    const first = await change(me, 0, 'pin'); assert.equal(first.statusCode, 200); assert.equal(first.json().pinned, true);
    assert.equal((await change(me, 0, 'pin')).json().pinnedAt, first.json().pinnedAt);
  });
  await test('server rejects sixth pin with exact message', async () => {
    for (let i = 1; i < 5; i++) assert.equal((await change(me, i, 'pin')).statusCode, 200);
    const sixth = await change(me, 5, 'pin'); assert.equal(sixth.statusCode, 400); assert.equal(sixth.json().message, 'Можно закрепить не больше 5 чатов');
  });
  await test('pinned newest first, then recent unpinned', async () => {
    assert.deepEqual((await list(me)).map(x => x.id), [4,3,2,1,0,6,5].map(i => conversations[i]));
  });
  await test('unpin frees a slot', async () => {
    assert.equal((await change(me, 0, 'pin', 'DELETE')).json().pinned, false);
    assert.equal((await change(me, 5, 'pin')).statusCode, 200);
  });
  await test('favorite is independent and can be removed', async () => {
    assert.equal((await change(me, 1, 'favorite')).json().favorite, true);
    const mine = (await list(me)).find(x => x.id === conversations[1]); assert.equal(mine.favorite, true); assert.equal(mine.pinned, true);
    const theirs = (await list(peer)).find(x => x.id === conversations[1]); assert.equal(theirs.favorite, false); assert.equal(theirs.pinned, false);
    assert.equal((await change(me, 1, 'favorite', 'DELETE')).json().favorite, false);
  });
  await test('outsider gets 403 for every preference mutation', async () => {
    for (const kind of ['pin', 'favorite']) for (const method of ['PUT','DELETE']) assert.equal((await change(outsider, 0, kind, method)).statusCode, 403);
  });
  await test('concurrent pins cannot exceed five', async () => {
    const results = await Promise.all(conversations.map((_, i) => change(peer, i, 'pin')));
    assert.equal(results.filter(x => x.statusCode === 200).length, 5); assert.equal(results.filter(x => x.statusCode === 400).length, 2);
    assert.equal((await list(peer)).filter(x => x.pinned).length, 5);
  });
  await test('conversation cascade removes preferences', async () => {
    await change(me, 6, 'favorite'); await query('DELETE FROM conversations WHERE id=$1', [conversations[6]]);
    assert.equal((await query('SELECT 1 FROM conversation_preferences WHERE conversation_id=$1', [conversations[6]])).length, 0);
  });
} finally {
  await app.close();
  await query('DELETE FROM conversations WHERE id=ANY($1::uuid[])', [conversations]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
  await pool.end();
}