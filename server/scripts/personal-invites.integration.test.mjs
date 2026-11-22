import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://localhost/invalid');
if (process.env.NODE_ENV !== 'test' || url.pathname !== '/contacts_ci' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Test database required');
const { pool } = await import('../src/db.ts');
const { createPersonalInvite, previewPersonalInvite, acceptPersonalInvite, revokePersonalInvite, searchPeople } = await import('../src/chat/personal-invites.ts');

async function user(name, options = {}) {
  const { rows } = await pool.query('INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id', [`${randomUUID()}@example.invalid`, 'not-a-login-hash']);
  const id = rows[0].id;
  await pool.query('INSERT INTO profiles(user_id, name, is_seed) VALUES ($1, $2, $3)', [id, name, !!options.seed]);
  await pool.query('INSERT INTO privacy_settings(user_id, visible_in_feed, who_can_message) VALUES ($1, $2, $3)', [id, options.visible !== false, options.policy ?? 'everyone']);
  return id;
}
test('people search and personal invites against PostgreSQL', async t => {
  try {
    const owner = await user('Пригласивший', { policy: 'matches' });
    const newcomer = await user('Новичок');
    const other = await user('Другой человек');
    const invitation = await createPersonalInvite(owner);
    await t.test('preview exposes only invitation identity', async () => {
      const result = await previewPersonalInvite(invitation.token);
      assert.deepEqual(Object.keys(result).sort(), ['inviterAvatarUrl', 'inviterName']);
      assert.equal(result.inviterName, 'Пригласивший');
      const { rows } = await pool.query('SELECT token_hash FROM personal_chat_invites WHERE id = $1', [invitation.id]);
      assert.notEqual(rows[0].token_hash, invitation.token);
    });
    let conversationId;
    await t.test('accepting creates a chat without fake messages or a dating match', async () => {
      const result = await acceptPersonalInvite(newcomer, invitation.token);
      conversationId = result.conversationId;
      assert.equal(result.created, true);
      const { rows } = await pool.query('SELECT match_id, (SELECT count(*)::int FROM messages WHERE conversation_id = $1) AS n FROM conversations WHERE id = $1', [conversationId]);
      assert.equal(rows[0].match_id, null);
      assert.equal(rows[0].n, 0);
    });
    await t.test('retries and another token reuse the same dialogue', async () => {
      const second = await createPersonalInvite(owner);
      const results = await Promise.all([acceptPersonalInvite(newcomer, invitation.token), acceptPersonalInvite(newcomer, second.token)]);
      assert.ok(results.every(x => x.conversationId === conversationId && !x.created));
    });
    await t.test('first simultaneous accepts create one dialogue', async () => {
      const second = await createPersonalInvite(owner);
      const results = await Promise.all([acceptPersonalInvite(other, invitation.token), acceptPersonalInvite(other, second.token)]);
      assert.equal(results[0].conversationId, results[1].conversationId);
      assert.equal(results.filter(x => x.created).length, 1);
    });
    await t.test('self-invitation is rejected', async () => {
      await assert.rejects(acceptPersonalInvite(owner, invitation.token), /собственное/);
    });
    await t.test('either-direction blocks prohibit acceptance even for an existing chat', async () => {
      for (const [a, b] of [[owner, newcomer], [newcomer, owner]]) {
        await pool.query('INSERT INTO blocks(user_id, blocked_id) VALUES ($1, $2)', [a, b]);
        await assert.rejects(acceptPersonalInvite(newcomer, invitation.token), /недоступен/);
        await pool.query('DELETE FROM blocks WHERE user_id = $1 AND blocked_id = $2', [a, b]);
      }
    });
    await t.test('only the owner can revoke; revoked and expired invites fail', async () => {
      const item = await createPersonalInvite(owner);
      await assert.rejects(revokePersonalInvite(other, item.id), /не найдено/);
      await revokePersonalInvite(owner, item.id);
      await assert.rejects(acceptPersonalInvite(newcomer, item.token), /недоступно/);
      const expired = await createPersonalInvite(owner);
      await pool.query("UPDATE personal_chat_invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [expired.id]);
      await assert.rejects(previewPersonalInvite(expired.token), /недоступно/);
    });
    await t.test('name search normalizes ё and excludes hidden, demo, paused, banned and blocked accounts', async () => {
      const visible = await user('Алёна Тестовая');
      await user('Алёна Скрытая', { visible: false });
      await user('Алёна Демо', { seed: true });
      const paused = await user('Алёна Пауза');
      await pool.query('UPDATE users SET paused_at = now() WHERE id = $1', [paused]);
      const banned = await user('Алёна Бан');
      await pool.query('UPDATE users SET blocked_at = now() WHERE id = $1', [banned]);
      const blocked = await user('Алёна Блок');
      await pool.query('INSERT INTO blocks(user_id, blocked_id) VALUES ($1, $2)', [blocked, newcomer]);
      const result = await searchPeople(newcomer, 'АЛЕНА');
      assert.deepEqual(result.map(x => x.id), [visible]);
      assert.equal('email' in result[0], false);
      assert.equal('phone' in result[0], false);
      assert.deepEqual(await searchPeople(newcomer, '%_'), []);
    });
    await t.test('invite permission never changes global message privacy', async () => {
      const { rows } = await pool.query('SELECT who_can_message FROM privacy_settings WHERE user_id = $1', [owner]);
      assert.equal(rows[0].who_can_message, 'matches');
    });
  } finally {
    await pool.end();
  }
});
