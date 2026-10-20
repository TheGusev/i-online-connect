import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID() + randomUUID();
const { pool, query, queryOne } = await import('../src/db.ts');
const { signAccessToken } = await import('../src/auth/tokens.ts');
const { chatRoutes } = await import('../src/routes/chat.ts');
const { spaceRoutes } = await import('../src/routes/spaces.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const { planReaction } = await import('../src/chat/reactions.ts');
const Fastify = (await import('fastify')).default;
const app = Fastify();
registerErrorHandler(app);
await app.register((await import('@fastify/multipart')).default);
await app.register(chatRoutes, { prefix: '/api/chat' });
await app.register(spaceRoutes, { prefix: '/api/spaces' });

const ids = []; const spaces = []; const convs = [];
async function user() {
  const id = randomUUID(); ids.push(id);
  await query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [id, `${id}@test.local`, 'unused-test-hash']);
  await query("INSERT INTO profiles(user_id,name,city) VALUES($1,'Тест','Новосибирск')", [id]);
  return { id, token: await signAccessToken(id) };
}
const me = await user(); const peer = await user(); const outsider = await user();
const conv = await queryOne('INSERT INTO conversations DEFAULT VALUES RETURNING id'); convs.push(conv.id);
await query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)', [conv.id, me.id, peer.id]);
const msg = await queryOne("INSERT INTO messages(conversation_id,author_id,text) VALUES($1,$2,'Привет') RETURNING id", [conv.id, peer.id]);
const sp = await queryOne("INSERT INTO spaces(title,host_id,category) VALUES('Реакции',$1,'city') RETURNING id", [me.id]); spaces.push(sp.id);
await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member')", [sp.id, me.id, peer.id]);
const smsg = await queryOne("INSERT INTO space_messages(space_id,author_id,text) VALUES($1,$2,'Всем привет') RETURNING id", [sp.id, peer.id]);

const chat = (who, method, emoji) => app.inject({ method, url: `/api/chat/conversations/${conv.id}/messages/${msg.id}/reactions`, headers: { authorization: `Bearer ${who.token}` }, payload: { emoji } });
const space = (who, method, emoji) => app.inject({ method, url: `/api/spaces/${sp.id}/messages/${smsg.id}/reactions`, headers: { authorization: `Bearer ${who.token}` }, payload: { emoji } });
const list = async (who) => (await app.inject({ method: 'GET', url: `/api/chat/conversations/${conv.id}/messages`, headers: { authorization: `Bearer ${who.token}` } })).json().items.find((m) => m.id === msg.id).reactions;

try {
  await test('лимит: при 1 замена, при 3 — REACTION_LIMIT', () => {
    assert.deepEqual(planReaction(['👍'], '🔥', 1), { remove: ['👍'], add: true });
    assert.throws(() => planReaction(['👍', '🔥', '😂'], '😮', 3), (e) => e.code === 'REACTION_LIMIT' && e.statusCode === 400);
  });
  await test('поставить, заменить, снять', async () => {
    assert.equal((await chat(me, 'PUT', '👍')).statusCode, 200);
    assert.deepEqual(await list(me), [{ emoji: '👍', count: 1, mine: true }]);
    const replaced = await chat(me, 'PUT', '🔥');
    assert.deepEqual(replaced.json().reactions, [{ emoji: '🔥', count: 1, mine: true }]);
    assert.equal((await chat(me, 'DELETE', '🔥')).statusCode, 200);
    assert.deepEqual(await list(me), []);
  });
  await test('чужая реакция не мешает и видна собеседнику', async () => {
    await chat(peer, 'PUT', '❤️'); await chat(me, 'PUT', '❤️');
    assert.deepEqual(await list(peer), [{ emoji: '❤️', count: 2, mine: true }]);
    await chat(me, 'DELETE', '❤️');
    assert.deepEqual(await list(me), [{ emoji: '❤️', count: 1, mine: false }]);
  });
  await test('посторонний получает 403, чужой эмодзи — 400', async () => {
    assert.equal((await chat(outsider, 'PUT', '👍')).statusCode, 403);
    assert.equal((await space(outsider, 'PUT', '👍')).statusCode, 403);
    assert.equal((await chat(me, 'PUT', '🦄')).statusCode, 400);
  });
  await test('сообщество: поставить и заменить', async () => {
    await space(me, 'PUT', '👍');
    const r = await space(me, 'PUT', '😂');
    assert.deepEqual(r.json().reactions, [{ emoji: '😂', count: 1, mine: true }]);
  });
} finally {
  await app.close();
  await query('DELETE FROM spaces WHERE id=ANY($1::uuid[])', [spaces]);
  await query('DELETE FROM conversations WHERE id=ANY($1::uuid[])', [convs]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
}
