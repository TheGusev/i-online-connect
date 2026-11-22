import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUserId, requireAuth } from '../auth/middleware.ts';
import { queryOne } from '../db.ts';
import { assertConversationAccess } from '../auth/middleware.ts';
import { acceptPersonalInvite, createPersonalInvite, previewPersonalInvite, revokePersonalInvite, searchPeople } from '../chat/personal-invites.ts';

const tokenBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export async function contactsRoutes(app: FastifyInstance) {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.post('/invites/preview', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const { token } = tokenBody.parse(request.body);
    return previewPersonalInvite(token);
  });
  app.get('/search', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(request.query);
    return { items: await searchPeople(currentUserId(request), q) };
  });
  app.post('/invites', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async request => {
    return createPersonalInvite(currentUserId(request));
  });
  app.delete('/invites/:id', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await revokePersonalInvite(currentUserId(request), id);
    return reply.status(204).send();
  });
  app.post('/invites/accept', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async request => {
    const { token } = tokenBody.parse(request.body);
    return acceptPersonalInvite(currentUserId(request), token);
  });
  app.get('/conversations/:id/origin', { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = currentUserId(request);
    await assertConversationAccess(userId, id);
    const row = await queryOne<{ inviter_name: string; accepted_at: Date }>(
      `SELECT p.name AS inviter_name, a.accepted_at FROM personal_chat_invite_acceptances a
         JOIN personal_chat_invites i ON i.id = a.invite_id JOIN profiles p ON p.user_id = i.inviter_id
        WHERE a.conversation_id = $1 ORDER BY a.accepted_at LIMIT 1`, [id],
    );
    return row ? { kind: 'personal_invite', inviterName: row.inviter_name, acceptedAt: row.accepted_at.toISOString() } : null;
  });
}
