/**
 * GET  /api/chat/conversations
 * GET  /api/chat/conversations/:id
 * GET  /api/chat/conversations/:id/messages
 * GET  /api/chat/conversations/:id/starters      — подсказки первой фразы
 * POST /api/chat/conversations/:id/messages      — { text }
 * POST /api/chat/conversations/:id/read
 * POST /api/chat/conversations/:id/meetings      — { kind, text }
 *
 * Каждый запрос проверяет, что пользователь — участник диалога
 * (assertConversationAccess). Без этой проверки любой мог бы читать чужую
 * переписку, подставив id в URL.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { forbidden, notFound } from "../http.ts";
import { assertConversationAccess, currentUserId, requireAuth } from "../auth/middleware.ts";
import { publishChatEvent } from "../ws/chat.ts";

const idParam = z.object({ id: z.string().uuid() });

const CONVERSATIONS_SELECT = `
  SELECT c.id,
         other.id            AS participant_id,
         op.name             AS participant_name,
         op.city             AS participant_city,
         op.trust_level      AS participant_trust,
         other.last_seen_at  AS participant_last_seen,
         (SELECT url FROM profile_media
           WHERE user_id = other.id AND kind = 'photo'
           ORDER BY is_primary DESC, position LIMIT 1) AS avatar_url,
         last_msg.text       AS last_message,
         last_msg.created_at AS last_message_at,
         last_msg.author_id  AS last_author_id,
         (SELECT count(*) FROM messages m
           WHERE m.conversation_id = c.id
             AND m.author_id <> $1
             AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at)
         )::int AS unread_count,
         ARRAY(
           SELECT i.label FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
            WHERE ui.user_id = other.id
              AND ui.interest_id IN (SELECT interest_id FROM user_interests WHERE user_id = $1)
         ) AS shared_interests
    FROM conversations c
    JOIN conversation_participants me    ON me.conversation_id = c.id AND me.user_id = $1
    JOIN conversation_participants their ON their.conversation_id = c.id AND their.user_id <> $1
    JOIN users other    ON other.id = their.user_id
    JOIN profiles op    ON op.user_id = other.id
    LEFT JOIN LATERAL (
      SELECT text, created_at, author_id FROM messages
       WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    ) last_msg ON true
   WHERE me.archived_at IS NULL
     AND other.deleted_at IS NULL
     AND NOT EXISTS (
           SELECT 1 FROM blocks b
            WHERE (b.user_id = $1 AND b.blocked_id = other.id)
               OR (b.user_id = other.id AND b.blocked_id = $1)
         )
`;

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

interface ConversationRow {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_city: string | null;
  participant_trust: "new" | "verified" | "trusted" | "ambassador";
  participant_last_seen: Date | null;
  avatar_url: string | null;
  last_message: string | null;
  last_message_at: Date | null;
  last_author_id: string | null;
  unread_count: number;
  shared_interests: string[] | null;
}

function toConversationDto(row: ConversationRow, userId: string) {
  const lastFromMe = row.last_author_id === userId;
  return {
    id: row.id,
    participant: {
      id: row.participant_id,
      name: row.participant_name,
      city: row.participant_city ?? undefined,
      trustLevel: row.participant_trust,
      avatarUrl: row.avatar_url ?? undefined,
      online: row.participant_last_seen
        ? Date.now() - row.participant_last_seen.getTime() < ONLINE_WINDOW_MS
        : false,
    },
    lastMessage: row.last_message ?? "",
    lastMessageAt: (row.last_message_at ?? new Date()).toISOString(),
    unreadCount: row.unread_count,
    // «Ждёт ответа»: последнее слово за собеседником.
    awaitingReply: Boolean(row.last_message_at) && !lastFromMe,
    sharedInterests: row.shared_interests ?? [],
    lastMessageFromMe: lastFromMe,
  };
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/conversations", async (request) => {
    const userId = currentUserId(request);
    const rows = await query<ConversationRow>(
      `${CONVERSATIONS_SELECT} ORDER BY last_msg.created_at DESC NULLS LAST`,
      [userId],
    );
    return rows.map((row) => toConversationDto(row, userId));
  });

  app.get<{ Params: { id: string } }>("/conversations/:id", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertConversationAccess(userId, id);

    const row = await queryOne<ConversationRow>(`${CONVERSATIONS_SELECT} AND c.id = $2`, [
      userId,
      id,
    ]);
    if (!row) throw notFound("Диалог не найден");
    return toConversationDto(row, userId);
  });

  app.get<{ Params: { id: string } }>("/conversations/:id/messages", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertConversationAccess(userId, id);

    const rows = await query<{
      id: string;
      conversation_id: string;
      author_id: string;
      text: string;
      kind: "text" | "meeting";
      created_at: Date;
    }>(
      `SELECT id, conversation_id, author_id, text, kind, created_at
         FROM messages WHERE conversation_id = $1 ORDER BY created_at LIMIT 500`,
      [id],
    );

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      authorId: row.author_id,
      text: row.text,
      kind: row.kind,
      createdAt: row.created_at.toISOString(),
      status: "sent" as const,
    }));
  });

  app.get<{ Params: { id: string } }>("/conversations/:id/starters", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertConversationAccess(userId, id);

    // TODO: подключить AI-сервис. Пока — подсказки на основе общих интересов,
    // чтобы экран работал без внешних зависимостей.
    const rows = await query<{ label: string }>(
      `SELECT i.label FROM interests i
        WHERE i.id IN (
          SELECT ui.interest_id FROM user_interests ui
            JOIN conversation_participants cp ON cp.user_id = ui.user_id
           WHERE cp.conversation_id = $1 AND cp.user_id <> $2
             AND ui.interest_id IN (SELECT interest_id FROM user_interests WHERE user_id = $2)
        )
        LIMIT 3`,
      [id, userId],
    );

    return rows.map((row) => `Заметил(а) у вас «${row.label}» — с чего всё началось?`);
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/messages", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const { text } = z.object({ text: z.string().min(1).max(4000) }).parse(request.body);
    await assertConversationAccess(userId, id);
    await assertNotBlockedInConversation(userId, id);

    const row = await queryOne<{ id: string; created_at: Date }>(
      `INSERT INTO messages (conversation_id, author_id, text)
       VALUES ($1, $2, $3) RETURNING id, created_at`,
      [id, userId, text],
    );
    if (!row) throw notFound("Диалог не найден");
    await query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [id]);

    const message = {
      id: row.id,
      conversationId: id,
      authorId: userId,
      text,
      kind: "text" as const,
      createdAt: row.created_at.toISOString(),
    };

    publishChatEvent(id, { type: "message", conversationId: id, message });
    return message;
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/read", async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertConversationAccess(userId, id);

    await query(
      "UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2",
      [id, userId],
    );
    publishChatEvent(id, { type: "read", conversationId: id, authorId: userId });
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/meetings", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const body = z
      .object({
        kind: z.enum(["coffee", "walk", "event"]),
        text: z.string().min(1).max(500),
      })
      .parse(request.body);
    await assertConversationAccess(userId, id);
    await assertNotBlockedInConversation(userId, id);

    const row = await queryOne<{ id: string; created_at: Date }>(
      `INSERT INTO messages (conversation_id, author_id, text, kind)
       VALUES ($1, $2, $3, 'meeting') RETURNING id, created_at`,
      [id, userId, body.text],
    );
    if (!row) throw notFound("Диалог не найден");

    await query(
      `INSERT INTO meetings (conversation_id, message_id, proposed_by, kind, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, row.id, userId, body.kind, body.text],
    );

    const message = {
      id: row.id,
      conversationId: id,
      authorId: userId,
      text: body.text,
      kind: "meeting" as const,
      createdAt: row.created_at.toISOString(),
    };
    publishChatEvent(id, { type: "message", conversationId: id, message });
    return message;
  });
}

/** Писать нельзя, если кто-то из двоих заблокировал другого. */
async function assertNotBlockedInConversation(userId: string, conversationId: string) {
  const blocked = await queryOne(
    `SELECT 1
       FROM conversation_participants cp
       JOIN blocks b ON (b.user_id = $1 AND b.blocked_id = cp.user_id)
                     OR (b.user_id = cp.user_id AND b.blocked_id = $1)
      WHERE cp.conversation_id = $2 AND cp.user_id <> $1`,
    [userId, conversationId],
  );
  if (blocked) throw forbidden("Диалог закрыт");
}
