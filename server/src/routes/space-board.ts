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

import { query, queryOne } from '../db.ts';
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

export async function spaceBoardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

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
