import { recordCommunityNotificationActivity } from "../notifications/community-activity.ts";
/**
 * Доска сообщества: постоянные карточки (фото, ссылка, заметка, вопрос).
 *
 *   GET    /api/spaces/news               — сообщества с новостями (звезда в списке)
 *   GET    /api/spaces/:id/board          — карточки за последние 90 дней
 *   POST   /api/spaces/:id/board          — положить карточку (JSON или multipart с фото)
 *   PATCH  /api/spaces/:id/board/:postId  — отметить вопрос / закрепить (организатор)
 *   DELETE /api/spaces/:id/board/:postId  — удалить (автор или организатор)
 *   POST   /api/spaces/:id/board/read     — отметить доску прочитанной
 *
 * Только участники сообщества. Ссылки не загружаем (SSRF): храним и показываем домен.
 * Через 90 дней карточки удаляются вместе с файлами.
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { unlink } from 'node:fs/promises';
import { z } from 'zod';

import { query, queryOne, transaction } from '../db.ts';
import { badRequest, forbidden, notFound } from '../http.ts';
import { assertSpaceMembership, currentUserId, requireAuth } from '../auth/middleware.ts';
import { assertVerified } from '../auth/verified.ts';
import { assertSize, detectMediaType, mediaPathFromUrl, saveChatMediaFile } from '../media/store.ts';
import { validateCardInput, type ValidCard } from '../live/cards.ts';
import {
  BOARD_DAILY_LIMIT,
  BOARD_LIST_LIMIT,
  BOARD_MAX_PINNED,
  BOARD_RETENTION_DAYS,
  canManageBoardPost,
  canPinBoardPost,
  retentionCutoff,
  toBoardPostDto,
  type BoardPostRow,
} from '../board/rules.ts';

const POST_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
const idParam = z.object({ id: z.string().uuid() });
const postParams = z.object({ id: z.string().uuid(), postId: z.string().uuid() });
const jsonBody = z.object({
  kind: z.enum(['note', 'link', 'question']),
  text: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  clientTempId: z.string().uuid(),
});
const patchBody = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => value.status !== undefined || value.pinned !== undefined, { message: 'Нечего менять' });

const SELECT_POST = `SELECT sp.id, sp.kind, sp.author_id, COALESCE(pr.name, 'Участник') AS author_name,
       sp.text, sp.url, sp.media_url, sp.media_mime, sp.status, sp.pinned_at, sp.created_at, sp.client_temp_id
  FROM space_posts sp
  JOIN users u ON u.id = sp.author_id AND u.deleted_at IS NULL AND u.blocked_at IS NULL
  LEFT JOIN profiles pr ON pr.user_id = sp.author_id`;

async function loadPost(spaceId: string, postId: string) {
  return queryOne<BoardPostRow>(`${SELECT_POST} WHERE sp.id = $1 AND sp.space_id = $2`, [postId, spaceId]);
}

async function findExisting(spaceId: string, userId: string, clientTempId: string) {
  return queryOne<BoardPostRow>(
    `${SELECT_POST} WHERE sp.space_id = $1 AND sp.author_id = $2 AND sp.client_temp_id = $3`,
    [spaceId, userId, clientTempId],
  );
}

async function isSpaceHost(spaceId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ host: boolean }>(
    `SELECT (s.host_id = $2 OR EXISTS (
               SELECT 1 FROM space_members m WHERE m.space_id = s.id AND m.user_id = $2 AND m.status = 'host'
             )) AS host
       FROM spaces s WHERE s.id = $1`,
    [spaceId, userId],
  );
  return row?.host === true;
}

async function purgeExpiredPosts(log: FastifyBaseLogger): Promise<void> {
  try {
    const cutoff = retentionCutoff(new Date()).toISOString();
    const rows = await query<{ id: string; media_url: string | null }>(
      'DELETE FROM space_posts WHERE created_at < $1::timestamptz RETURNING id, media_url',
      [cutoff],
    );
    for (const row of rows) {
      if (!row.media_url) continue;
      const filePath = mediaPathFromUrl(row.media_url);
      if (filePath) await unlink(filePath).catch(() => undefined);
    }
    if (rows.length > 0) log.info(`[board] удалено карточек старше ${BOARD_RETENTION_DAYS} дней: ${rows.length}`);
  } catch (error) {
    log.error(`[board] очистка не удалась: ${String(error)}`);
  }
}


/** Обсуждения принадлежат материалу; общий чат здесь не используется. */
function registerPostDiscussions(app: FastifyInstance): void {
  const commentInput = z.object({
    text: z.string().trim().min(1).max(2000),
    clientTempId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
  });
  const reactionInput = z.object({
    reaction: z.enum(['like', 'thanks', 'idea', 'question']).nullable(),
  });

  async function access(request: Parameters<typeof currentUserId>[0], params: unknown) {
    const userId = currentUserId(request);
    const { id, postId } = postParams.parse(params);
    await assertSpaceMembership(userId, id);
    return { userId, id, postId };
  }

  const materialSql = `
    SELECT p.id, p.comments_closed, p.author_id, s.host_id
    FROM space_posts p JOIN spaces s ON s.id = p.space_id
    WHERE p.id = $1 AND p.space_id = $2
  `;

  const commentSql = `
    SELECT c.id, c.post_id AS "postId", c.author_id AS "authorId",
           COALESCE(pr.name, 'Участник') AS "authorName",
           c.parent_id AS "parentId",
           CASE WHEN c.deleted_at IS NULL THEN c.text ELSE '' END AS text,
           c.created_at AS "createdAt", c.updated_at AS "updatedAt",
           c.deleted_at AS "deletedAt", c.client_temp_id AS "clientTempId"
    FROM space_post_comments c
    LEFT JOIN profiles pr ON pr.user_id = c.author_id
  `;

  type Material = {
    id: string;
    comments_closed: boolean;
    author_id: string;
    host_id: string;
  };

  app.get<{ Params: { id: string; postId: string } }>(
    '/:id/board/:postId/discussion',
    async (request, reply) => {
      const { userId, id, postId } = await access(request, request.params);
      reply.header('Cache-Control', 'private, no-store');
      const material = await queryOne<Material>(materialSql, [postId, id]);
      if (!material) throw notFound('Материал не найден');

      const { before } = z.object({
        before: z.string().uuid().optional(),
      }).parse(request.query ?? {});

      if (before) {
        const cursor = await queryOne(
          'SELECT id FROM space_post_comments WHERE id = $1 AND post_id = $2',
          [before, postId],
        );
        if (!cursor) throw badRequest('Неверная страница комментариев');
      }

      const rows = await query(
        commentSql + `
          WHERE c.post_id = $1
            AND ($2::uuid IS NULL OR
              (c.created_at, c.id) < (
                SELECT created_at, id FROM space_post_comments
                WHERE id = $2 AND post_id = $1
              ))
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT 51
        `,
        [postId, before ?? null],
      );

      const page = rows.slice(0, 50);
      const reactions = await query(
        `SELECT reaction, count(*)::int AS count,
                bool_or(user_id = $2) AS mine
         FROM space_post_reactions WHERE post_id = $1
         GROUP BY reaction ORDER BY reaction`,
        [postId, userId],
      );

      return {
        items: [...page].reverse(),
        hasMore: rows.length > 50,
        nextBefore: rows.length > 50 ? page[page.length - 1]?.id : null,
        commentsClosed: material.comments_closed,
        canComment: !material.comments_closed &&
          material.author_id === material.host_id,
        canModerate: material.host_id === userId,
        reactions,
      };
    },
  );

  app.post<{ Params: { id: string; postId: string } }>(
    '/:id/board/:postId/comments',
    POST_LIMIT,
    async (request, reply) => {
      const { userId, id, postId } = await access(request, request.params);
      const body = commentInput.parse(request.body ?? {});
      reply.header('Cache-Control', 'private, no-store');

      return transaction(async (client) => {
        const material = (await client.query<Material>(
          materialSql + ' FOR UPDATE OF p', [postId, id],
        )).rows[0];
        if (!material) throw notFound('Материал не найден');

        const existing = (await client.query(
          commentSql + `
            WHERE c.post_id = $1 AND c.author_id = $2
              AND c.client_temp_id = $3
          `,
          [postId, userId, body.clientTempId],
        )).rows[0];
        if (existing) return existing;

        if (material.author_id !== material.host_id) {
          throw forbidden('Обсуждать можно материалы создателя сообщества');
        }
        if (material.comments_closed) {
          throw forbidden('Создатель закрыл комментарии');
        }

        if (body.parentId) {
          const parent = (await client.query(
            `SELECT id FROM space_post_comments
             WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL`,
            [body.parentId, postId],
          )).rows[0];
          if (!parent) throw badRequest('Комментарий для ответа не найден');
        }

        const inserted = (await client.query<{ id: string }>(
          `INSERT INTO space_post_comments
             (post_id, author_id, parent_id, text, client_temp_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [postId, userId, body.parentId ?? null, body.text, body.clientTempId],
        )).rows[0];
        if (!inserted) throw badRequest('Не удалось сохранить комментарий');

        const result = (await client.query(
          commentSql + ' WHERE c.id = $1', [inserted.id],
        )).rows[0];
        reply.code(201);
        return result;
      }).then(async (result) => {
        if (result) {
          await recordCommunityNotificationActivity(
            userId,
            "space_comment",
            result.id,
          );
        }
        return result;
      });
    },
  );


  const commentParams = postParams.extend({
    commentId: z.string().uuid(),
  });

  async function changeBoardComment(
    request: Parameters<typeof currentUserId>[0],
    params: unknown,
    input: unknown,
    remove: boolean,
  ) {
    const parsed = commentParams.parse(params);
    const { userId, id, postId } = await access(request, parsed);
    const body = remove
      ? null
      : z.object({
          text: z.string().trim().min(1).max(2000),
        }).parse(input ?? {});

    return transaction(async (client) => {
      const material = (
        await client.query<Material>(
          materialSql + ' FOR UPDATE OF p',
          [postId, id],
        )
      ).rows[0];

      if (!material) {
        throw notFound('Материал не найден');
      }

      const comment = (
        await client.query<{
          author_id: string | null;
          deleted_at: Date | null;
        }>(
          `SELECT author_id, deleted_at
           FROM space_post_comments
           WHERE id = $1 AND post_id = $2
           FOR UPDATE`,
          [parsed.commentId, postId],
        )
      ).rows[0];

      if (!comment) {
        throw notFound('Комментарий не найден');
      }

      const isAuthor = comment.author_id === userId;
      const isCreator = material.host_id === userId;

      if (remove) {
        if (!isAuthor && !isCreator) {
          throw forbidden('Нельзя удалить чужой комментарий');
        }

        if (!comment.deleted_at) {
          await client.query(
            `UPDATE space_post_comments
             SET text = '[удалено]',
                 deleted_at = now(),
                 updated_at = now()
             WHERE id = $1 AND post_id = $2`,
            [parsed.commentId, postId],
          );
        }
      } else {
        if (!isAuthor) {
          throw forbidden('Редактировать можно только свой комментарий');
        }
        if (comment.deleted_at) {
          throw badRequest('Комментарий уже удалён');
        }
        if (material.comments_closed) {
          throw forbidden('Создатель закрыл комментарии');
        }
        if (!body) {
          throw badRequest('Текст комментария не задан');
        }

        await client.query(
          `UPDATE space_post_comments
           SET text = $3, updated_at = now()
           WHERE id = $1 AND post_id = $2`,
          [parsed.commentId, postId, body.text],
        );
      }

      const result = (
        await client.query(
          commentSql + ' WHERE c.id = $1 AND c.post_id = $2',
          [parsed.commentId, postId],
        )
      ).rows[0];

      if (!result) {
        throw notFound('Комментарий не найден');
      }
      return result;
    });
  }

  app.patch<{
    Params: { id: string; postId: string; commentId: string };
  }>(
    '/:id/board/:postId/comments/:commentId',
    POST_LIMIT,
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return changeBoardComment(
        request,
        request.params,
        request.body,
        false,
      );
    },
  );

  app.delete<{
    Params: { id: string; postId: string; commentId: string };
  }>(
    '/:id/board/:postId/comments/:commentId',
    POST_LIMIT,
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return changeBoardComment(
        request,
        request.params,
        undefined,
        true,
      );
    },
  );

  app.put<{ Params: { id: string; postId: string } }>(
    '/:id/board/:postId/reaction',
    POST_LIMIT,
    async (request, reply) => {
      const { userId, id, postId } = await access(request, request.params);
      const { reaction } = reactionInput.parse(request.body ?? {});
      reply.header('Cache-Control', 'private, no-store');

      await transaction(async (client) => {
        const material = (await client.query<Material>(
          materialSql + ' FOR UPDATE OF p', [postId, id],
        )).rows[0];
        if (!material) throw notFound('Материал не найден');
        if (reaction === null) {
          await client.query(
            'DELETE FROM space_post_reactions WHERE post_id = $1 AND user_id = $2',
            [postId, userId],
          );
        } else {
          await client.query(
            `INSERT INTO space_post_reactions(post_id, user_id, reaction)
             VALUES ($1, $2, $3)
             ON CONFLICT (post_id, user_id)
             DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()`,
            [postId, userId, reaction],
          );
        }
      });
      return { ok: true };
    },
  );

  app.patch<{ Params: { id: string; postId: string } }>(
    '/:id/board/:postId/discussion',
    POST_LIMIT,
    async (request, reply) => {
      const { userId, id, postId } = await access(request, request.params);
      const { closed } = z.object({
        closed: z.boolean(),
      }).parse(request.body ?? {});
      reply.header('Cache-Control', 'private, no-store');

      await transaction(async (client) => {
        const material = (await client.query<Material>(
          materialSql + ' FOR UPDATE OF p', [postId, id],
        )).rows[0];
        if (!material) throw notFound('Материал не найден');
        if (material.host_id !== userId) {
          throw forbidden('Закрывать обсуждение может только создатель');
        }
        await client.query(
          'UPDATE space_posts SET comments_closed = $2 WHERE id = $1',
          [postId, closed],
        );
      });
      return { commentsClosed: closed };
    },
  );
}

export async function spaceBoardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  registerPostDiscussions(app);

  // Очистка просроченных карточек: каждую ночь и один раз после старта.
  const purge = () => {
    void purgeExpiredPosts(app.log);
  };
  const task = cron.schedule('40 3 * * *', purge);
  const startup = setTimeout(purge, 120_000);
  startup.unref();
  app.addHook('onClose', async () => {
    task.stop();
    clearTimeout(startup);
  });

  app.get('/news', async (request, reply) => {
    const userId = currentUserId(request);
    reply.header('Cache-Control', 'private, no-store');
    const rows = await query<{ id: string }>(
      `SELECT m.space_id AS id
         FROM space_members m
         LEFT JOIN space_reads r ON r.space_id = m.space_id AND r.user_id = m.user_id
        WHERE m.user_id = $1 AND m.status IN ('member', 'host')
          AND (
            EXISTS (SELECT 1 FROM space_posts p
                     WHERE p.space_id = m.space_id AND p.author_id <> $1
                       AND p.created_at > COALESCE(r.last_read_at, m.joined_at))
            OR EXISTS (SELECT 1 FROM space_events e
                        WHERE e.space_id = m.space_id AND e.created_by <> $1
                          AND e.created_at > COALESCE(r.last_read_at, m.joined_at))
          )`,
      [userId],
    );
    return { ids: rows.map((row) => row.id) };
  });

  app.get<{ Params: { id: string } }>('/:id/board', async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);
    reply.header('Cache-Control', 'private, no-store');
    const rows = await query<BoardPostRow>(
      `${SELECT_POST} WHERE sp.space_id = $1 AND sp.created_at > $2::timestamptz
        ORDER BY sp.created_at DESC LIMIT ${BOARD_LIST_LIMIT}`,
      [id, retentionCutoff(new Date()).toISOString()],
    );
    return { posts: rows.map(toBoardPostDto), retentionDays: BOARD_RETENTION_DAYS };
  });

  app.post<{ Params: { id: string } }>('/:id/board/read', async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);
    await query(
      `INSERT INTO space_reads (space_id, user_id, last_read_at) VALUES ($1, $2, now())
       ON CONFLICT (space_id, user_id) DO UPDATE SET last_read_at = now()`,
      [id, userId],
    );
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/:id/board', POST_LIMIT, async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);
    const creator = await queryOne<{ id: string }>(
      'SELECT id FROM spaces WHERE id = $1 AND host_id = $2',
      [id, userId],
    );
    if (!creator) throw forbidden('Публиковать материалы может только создатель сообщества');

    let clientTempId: string;
    let valid: ValidCard;
    let file: { buffer: Buffer; type: NonNullable<ReturnType<typeof detectMediaType>> } | null = null;

    if (request.isMultipart()) {
      await assertVerified(userId);
      const parts = request.parts({ limits: { files: 1, fields: 3 } });
      let buffer: Buffer | null = null;
      let kind = '';
      let text = '';
      clientTempId = '';
      for await (const part of parts) {
        if (part.type === 'file') buffer = await part.toBuffer();
        else if (part.fieldname === 'kind') kind = String(part.value);
        else if (part.fieldname === 'clientTempId') clientTempId = String(part.value);
        else if (part.fieldname === 'text') text = String(part.value);
      }
      if (kind !== 'photo') throw badRequest('Файлом можно отправить только фото');
      if (!z.string().uuid().safeParse(clientTempId).success) throw badRequest('Поле clientTempId должно быть UUID');
      if (!buffer || buffer.length < 512) throw badRequest('Файл пустой — выберите другой');
      const type = detectMediaType(buffer);
      if (!type || type.kind !== 'photo') throw badRequest('Поддерживаем только фото JPEG/PNG/WebP');
      assertSize(type, buffer.length);
      const check = validateCardInput({ kind: 'photo', text, hasMedia: true });
      if (!check.ok) throw badRequest(check.error);
      valid = check.value;
      file = { buffer, type };
    } else {
      const body = jsonBody.parse(request.body ?? {});
      clientTempId = body.clientTempId;
      const check = validateCardInput({ kind: body.kind, text: body.text, url: body.url });
      if (!check.ok) throw badRequest(check.error);
      valid = check.value;
    }

    const existing = await findExisting(id, userId, clientTempId);
    if (existing) return toBoardPostDto(existing);

    const daily = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM space_posts
        WHERE space_id = $1 AND author_id = $2 AND created_at > now() - interval '1 day'`,
      [id, userId],
    );
    if ((daily?.n ?? 0) >= BOARD_DAILY_LIMIT) throw badRequest('Сегодня уже много карточек — продолжите завтра');

    const saved = file ? await saveChatMediaFile(userId, file.buffer, file.type) : null;
    let inserted = false;
    try {
      const row = await queryOne<{ id: string }>(
        `INSERT INTO space_posts (space_id, author_id, kind, text, url, media_url, media_mime, client_temp_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (space_id, author_id, client_temp_id) DO NOTHING
         RETURNING id`,
        [id, userId, valid.kind, valid.text, valid.url, saved?.url ?? null, file?.type.mime ?? null, clientTempId],
      );
      if (!row) {
        if (saved) await unlink(saved.filePath).catch(() => undefined);
        const again = await findExisting(id, userId, clientTempId);
        if (!again) throw badRequest('Не удалось сохранить карточку');
        return toBoardPostDto(again);
      }
      inserted = true;
      const created = await loadPost(id, row.id);
      if (!created) throw notFound('Карточка не найдена');
      await recordCommunityNotificationActivity(userId, "space_post", row.id);
      reply.code(201);
      return toBoardPostDto(created);
    } catch (error) {
      if (saved && !inserted) await unlink(saved.filePath).catch(() => undefined);
      throw error;
    }
  });

  app.patch<{ Params: { id: string; postId: string } }>('/:id/board/:postId', POST_LIMIT, async (request) => {
    const userId = currentUserId(request);
    const { id, postId } = postParams.parse(request.params);
    await assertSpaceMembership(userId, id);
    const body = patchBody.parse(request.body ?? {});
    const post = await queryOne<{ author_id: string; kind: string }>(
      'SELECT author_id, kind FROM space_posts WHERE id = $1 AND space_id = $2',
      [postId, id],
    );
    if (!post) throw notFound('Карточка не найдена');
    const host = await isSpaceHost(id, userId);

    if (body.status !== undefined) {
      if (post.kind !== 'question') throw badRequest('Отметить «отвечен» можно только у вопроса');
      if (!canManageBoardPost(userId, post.author_id, host)) {
        throw forbidden('Менять карточку может автор или организатор сообщества');
      }
    }
    if (body.pinned !== undefined) {
      if (!canPinBoardPost(host)) throw forbidden('Закреплять может организатор сообщества');
      if (body.pinned) {
        const pinned = await queryOne<{ n: number }>(
          'SELECT count(*)::int AS n FROM space_posts WHERE space_id = $1 AND pinned_at IS NOT NULL AND id <> $2',
          [id, postId],
        );
        if ((pinned?.n ?? 0) >= BOARD_MAX_PINNED) throw badRequest(`Закрепить можно не больше ${BOARD_MAX_PINNED} карточек`);
      }
    }

    await query(
      `UPDATE space_posts SET
         status = COALESCE($3::text, status),
         pinned_at = CASE WHEN $4::boolean IS NULL THEN pinned_at
                          WHEN $4::boolean THEN COALESCE(pinned_at, now())
                          ELSE NULL END
       WHERE id = $1 AND space_id = $2`,
      [postId, id, body.status ?? null, body.pinned ?? null],
    );
    const updated = await loadPost(id, postId);
    if (!updated) throw notFound('Карточка не найдена');
    return toBoardPostDto(updated);
  });

  app.delete<{ Params: { id: string; postId: string } }>('/:id/board/:postId', POST_LIMIT, async (request) => {
    const userId = currentUserId(request);
    const { id, postId } = postParams.parse(request.params);
    await assertSpaceMembership(userId, id);
    const post = await queryOne<{ author_id: string; media_url: string | null }>(
      'SELECT author_id, media_url FROM space_posts WHERE id = $1 AND space_id = $2',
      [postId, id],
    );
    if (!post) throw notFound('Карточка не найдена');
    const host = await isSpaceHost(id, userId);
    if (!canManageBoardPost(userId, post.author_id, host)) {
      throw forbidden('Удалить карточку может автор или организатор сообщества');
    }
    await query('DELETE FROM space_posts WHERE id = $1', [postId]);
    if (post.media_url) {
      const filePath = mediaPathFromUrl(post.media_url);
      if (filePath) await unlink(filePath).catch(() => undefined);
    }
    return { ok: true, id: postId };
  });
}
