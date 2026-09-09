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

import { query, queryOne, transaction } from "../db.ts";
import { badRequest, forbidden, notFound } from "../http.ts";
import { assertConversationAccess, currentUserId, requireAuth } from "../auth/middleware.ts";
import { isInRoom, publishChatEvent } from "../ws/chat.ts";
import { publishUserEvent } from "../ws/notifications.ts";

const idParam = z.object({ id: z.string().uuid() });

interface MessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  text: string;
  kind: "text" | "meeting";
  created_at: Date;
  read_by_peer: boolean | null;
}

function toMessageDto(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    text: row.text,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
    status: row.read_by_peer ? ("read" as const) : ("sent" as const),
  };
}

const SEND_LIMIT = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

/**
 * Уведомление получателю о новом сообщении. Пропускаем, если он прямо сейчас
 * держит диалог открытым (сообщение уже пришло по сокету), если это
 * демо-профиль или кто-то из двоих заблокирован.
 */
async function notifyRecipient(
  conversationId: string,
  senderId: string,
  message: { id: string; text: string; kind: "text" | "meeting" },
) {
  try {
    const recipient = await queryOne<{ user_id: string; is_seed: boolean; sender_name: string }>(
      `SELECT cp.user_id, p.is_seed,
              (SELECT name FROM profiles WHERE user_id = $2) AS sender_name
         FROM conversation_participants cp
         JOIN profiles p ON p.user_id = cp.user_id
        WHERE cp.conversation_id = $1 AND cp.user_id <> $2
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.user_id = cp.user_id AND b.blocked_id = $2)
                OR (b.user_id = $2 AND b.blocked_id = cp.user_id)
          )
        LIMIT 1`,
      [conversationId, senderId],
    );
    if (!recipient || recipient.is_seed) return;
    if (isInRoom(conversationId, recipient.user_id)) return;

    const preview = message.kind === "meeting" ? "Предлагает встретиться" : message.text.slice(0, 120);
    const payload = {
      conversationId,
      messageId: message.id,
      fromId: senderId,
      fromName: recipient.sender_name,
      preview,
    };
    const rows = await query<{ id: string; created_at: Date }>(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, 'new_message', $2::jsonb) RETURNING id, created_at`,
      [recipient.user_id, JSON.stringify(payload)],
    );
    const created = rows[0];
    if (!created) return;
    publishUserEvent(recipient.user_id, {
      type: "notification",
      notification: {
        id: created.id,
        kind: "new_message",
        payload,
        readAt: null,
        createdAt: created.created_at.toISOString(),
      },
    });
  } catch (error) {
    console.error("[chat] уведомление о сообщении", error);
  }
}

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

  /**
   * История с курсором: отдаём последние `limit` сообщений (по умолчанию 50),
   * `?before=<ISO>` возвращает более ранние. Ответ всегда по возрастанию даты.
   */
  app.get<{ Params: { id: string } }>("/conversations/:id/messages", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const q = z
      .object({
        before: z.string().datetime({ offset: true }).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .parse(request.query ?? {});
    await assertConversationAccess(userId, id);

    const limit = q.limit ?? 50;
    const rows = await query<MessageRow>(
      `SELECT m.id, m.conversation_id, m.author_id, m.text, m.kind, m.created_at,
              (m.author_id = $2 AND their.last_read_at IS NOT NULL
                 AND m.created_at <= their.last_read_at) AS read_by_peer
         FROM messages m
         LEFT JOIN conversation_participants their
           ON their.conversation_id = m.conversation_id AND their.user_id <> $2
        WHERE m.conversation_id = $1
          AND ($3::timestamptz IS NULL OR m.created_at < $3::timestamptz)
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $4`,
      [id, userId, q.before ?? null, limit + 1],
    );

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return {
      items: page.map(toMessageDto),
      hasMore,
      nextBefore: hasMore && page[0] ? page[0].created_at.toISOString() : null,
    };
  });

  /** Сколько диалогов с непрочитанными — для бейджа в меню. */
  app.get("/unread-count", async (request) => {
    const userId = currentUserId(request);
    const row = await queryOne<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM conversation_participants me
         JOIN conversations c ON c.id = me.conversation_id
        WHERE me.user_id = $1 AND me.archived_at IS NULL
          AND EXISTS (
            SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id AND m.author_id <> $1
               AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at)
          )`,
      [userId],
    );
    return { count: row?.count ?? 0 };
  });

  /**
   * POST /conversations { participantId } — открыть диалог с человеком.
   * Возвращает существующий или создаёт новый с учётом приватности собеседника.
   */
  app.post(
    "/conversations",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const { participantId } = z
        .object({ participantId: z.string().uuid() })
        .parse(request.body);
      if (participantId === userId) throw badRequest("Нельзя написать самому себе");

      const target = await queryOne<{
        is_seed: boolean;
        who_can_message: "everyone" | "verified" | "matches";
        deleted_at: Date | null;
      }>(
        `SELECT p.is_seed, COALESCE(ps.who_can_message, 'verified') AS who_can_message, u.deleted_at
           FROM users u
           JOIN profiles p ON p.user_id = u.id
           LEFT JOIN privacy_settings ps ON ps.user_id = u.id
          WHERE u.id = $1`,
        [participantId],
      );
      if (!target || target.deleted_at) throw notFound("Пользователь не найден");
      if (target.is_seed) {
        throw forbidden("Это демо-профиль для примера, реальные пользователи скоро появятся");
      }

      const blocked = await queryOne(
        `SELECT 1 FROM blocks
          WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`,
        [userId, participantId],
      );
      if (blocked) throw forbidden("Диалог недоступен");

      const existing = await queryOne<{ id: string }>(
        `SELECT c.id FROM conversations c
           JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = $1
           JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = $2
          ORDER BY c.created_at LIMIT 1`,
        [userId, participantId],
      );
      if (existing) return { conversationId: existing.id, created: false as const };

      const [a, b] = userId < participantId ? [userId, participantId] : [participantId, userId];
      const match = await queryOne<{ id: string }>(
        "SELECT id FROM matches WHERE user_a = $1 AND user_b = $2",
        [a, b],
      );

      if (!match) {
        if (target.who_can_message === "matches") {
          throw forbidden("Этот человек принимает сообщения только от совпадений");
        }
        if (target.who_can_message === "verified") {
          const me = await queryOne<{ trust_level: string }>(
            "SELECT trust_level FROM profiles WHERE user_id = $1",
            [userId],
          );
          if (!me || me.trust_level === "new") {
            throw forbidden("Этот человек принимает сообщения только от проверенных пользователей");
          }
        }
      }

      const conversationId = await transaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          "INSERT INTO conversations (match_id) VALUES ($1) RETURNING id",
          [match?.id ?? null],
        );
        const created = rows[0]?.id;
        if (!created) throw new Error("conversation insert failed");
        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id)
           VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
          [created, a, b],
        );
        return created;
      });
      return { conversationId, created: true as const };
    },
  );

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

  app.post<{ Params: { id: string } }>("/conversations/:id/messages", SEND_LIMIT, async (request) => {
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

    publishChatEvent(id, { type: "message", conversationId: id, message: { ...message, status: "sent" } });
    void notifyRecipient(id, userId, message);
    return { ...message, status: "sent" as const };
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/read", async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertConversationAccess(userId, id);

    await query(
      "UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2",
      [id, userId],
    );
    // Уведомления «новое сообщение» из этого диалога тоже считаем прочитанными.
    await query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL AND kind = 'new_message'
          AND payload->>'conversationId' = $2`,
      [userId, id],
    );
    publishChatEvent(id, { type: "read", conversationId: id, authorId: userId });
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/meetings", SEND_LIMIT, async (request) => {
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
    publishChatEvent(id, { type: "message", conversationId: id, message: { ...message, status: "sent" } });
    void notifyRecipient(id, userId, message);
    return { ...message, status: "sent" as const };
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
