import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne, transaction } from '../db.ts';
import { badRequest, forbidden, notFound } from '../http.ts';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function validToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound('Приглашение недоступно');
  return digest(token);
}

export async function createPersonalInvite(userId: string) {
  const owner = await queryOne(
    `SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL AND u.blocked_at IS NULL
        AND u.paused_at IS NULL AND p.is_seed = false`, [userId],
  );
  if (!owner) throw forbidden('Приглашения недоступны для этого аккаунта');
  const token = randomBytes(32).toString('base64url');
  const invite = await queryOne<{ id: string; expires_at: Date }>(
    'INSERT INTO personal_chat_invites(token_hash, inviter_id) VALUES ($1, $2) RETURNING id, expires_at',
    [digest(token), userId],
  );
  if (!invite) throw new Error('Invite insert failed');
  return { id: invite.id, token, expiresAt: invite.expires_at.toISOString() };
}

export async function previewPersonalInvite(token: string) {
  const row = await queryOne<{ name: string; avatar_url: string | null }>(
    `SELECT p.name, (SELECT pm.url FROM profile_media pm WHERE pm.user_id = u.id AND pm.kind = 'photo'
       ORDER BY pm.is_primary DESC, pm.position LIMIT 1) AS avatar_url
       FROM personal_chat_invites i JOIN users u ON u.id = i.inviter_id JOIN profiles p ON p.user_id = u.id
      WHERE i.token_hash = $1 AND i.revoked_at IS NULL AND i.expires_at > now()
        AND u.deleted_at IS NULL AND u.blocked_at IS NULL AND u.paused_at IS NULL AND p.is_seed = false`,
    [validToken(token)],
  );
  if (!row) throw notFound('Приглашение недоступно');
  return { inviterName: row.name, inviterAvatarUrl: row.avatar_url };
}

export async function revokePersonalInvite(userId: string, inviteId: string) {
  const row = await queryOne(
    'UPDATE personal_chat_invites SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND inviter_id = $2 RETURNING id',
    [inviteId, userId],
  );
  if (!row) throw notFound('Приглашение не найдено');
}

export async function acceptPersonalInvite(userId: string, token: string) {
  const hash = validToken(token);
  return transaction(async client => {
    const invitation = await client.query<{ id: string; inviter_id: string }>(
      `SELECT id, inviter_id FROM personal_chat_invites
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`, [hash],
    );
    const invite = invitation.rows[0];
    if (!invite) throw notFound('Приглашение недоступно');
    if (invite.inviter_id === userId) throw badRequest('Это ваше собственное приглашение');
    const [a, b] = [userId, invite.inviter_id].sort();
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`personal-direct:${a}:${b}`]);
    const accounts = await client.query(
      `SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.id = ANY($1::uuid[]) AND u.deleted_at IS NULL AND u.blocked_at IS NULL
          AND u.paused_at IS NULL AND p.is_seed = false FOR SHARE OF u, p`, [[a, b]],
    );
    if (accounts.rows.length !== 2) throw notFound('Приглашение недоступно');
    const blocked = await client.query(
      'SELECT 1 FROM blocks WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)', [a, b],
    );
    if (blocked.rows.length) throw forbidden('Диалог недоступен');
    // Both parties consent through creating and accepting this invitation.
    // This grant applies only to their dialogue; global privacy settings are unchanged.
    const existing = await client.query<{ id: string }>(
      `SELECT c.id FROM conversations c
         JOIN conversation_participants x ON x.conversation_id = c.id AND x.user_id = $1
         JOIN conversation_participants y ON y.conversation_id = c.id AND y.user_id = $2
        WHERE NOT EXISTS (SELECT 1 FROM conversation_participants z WHERE z.conversation_id = c.id AND z.user_id NOT IN ($1, $2))
        ORDER BY c.created_at, c.id LIMIT 1`, [a, b],
    );
    let conversationId = existing.rows[0]?.id;
    const created = !conversationId;
    if (!conversationId) {
      const result = await client.query<{ id: string }>('INSERT INTO conversations DEFAULT VALUES RETURNING id');
      conversationId = result.rows[0]?.id;
      if (!conversationId) throw new Error('Conversation insert failed');
      await client.query(
        'INSERT INTO conversation_participants(conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [conversationId, a, b],
      );
    }
    await client.query(
      `INSERT INTO personal_chat_invite_acceptances(invite_id, invitee_id, conversation_id) VALUES ($1, $2, $3)
       ON CONFLICT (invite_id, invitee_id) DO NOTHING`, [invite.id, userId, conversationId],
    );
    await client.query(
      'UPDATE conversation_participants SET archived_at = NULL WHERE conversation_id = $1 AND user_id IN ($2, $3)',
      [conversationId, a, b],
    );
    return { conversationId, created };
  });
}

export async function searchPeople(userId: string, text: string) {
  const words = text.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim().split(/\s+/).filter(Boolean);
  if (words.join(' ').length < 2 || text.length > 80 || words.length > 5) return [];
  const patterns = words.map(word => `%${word.replace(/[\\%_]/g, '\\$&')}%`);
  const rows = await query<{
    id: string; name: string; city: string; avatar_url: string | null; can_message: boolean;
  }>(
    `SELECT u.id, p.name, p.city,
        (SELECT pm.url FROM profile_media pm WHERE pm.user_id = u.id AND pm.kind = 'photo'
          ORDER BY pm.is_primary DESC, pm.position LIMIT 1) AS avatar_url,
        (COALESCE(ps.who_can_message, 'verified') = 'everyone'
         OR EXISTS (SELECT 1 FROM matches m WHERE m.user_a = LEAST($1::uuid, u.id) AND m.user_b = GREATEST($1::uuid, u.id))
         OR (COALESCE(ps.who_can_message, 'verified') = 'verified' AND EXISTS
              (SELECT 1 FROM profiles me WHERE me.user_id = $1 AND me.trust_level <> 'new'))) AS can_message
       FROM users u JOIN profiles p ON p.user_id = u.id
       LEFT JOIN privacy_settings ps ON ps.user_id = u.id
      WHERE u.id <> $1 AND u.deleted_at IS NULL AND u.blocked_at IS NULL AND u.paused_at IS NULL
        AND p.is_seed = false AND COALESCE(ps.visible_in_feed, true) = true
        AND NOT EXISTS (SELECT 1 FROM unnest($2::text[]) AS needle(pattern)
          WHERE replace(lower(p.name), 'ё', 'е') NOT LIKE needle.pattern ESCAPE '\\')
        AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE
          (bl.user_id = $1 AND bl.blocked_id = u.id) OR (bl.user_id = u.id AND bl.blocked_id = $1))
      ORDER BY lower(p.name), u.id LIMIT 20`, [userId, patterns],
  );
  return rows.map(row => ({ id: row.id, name: row.name, city: row.city, avatarUrl: row.avatar_url, canMessage: row.can_message }));
}
