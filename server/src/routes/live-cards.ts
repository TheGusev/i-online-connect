/**
 * Карточки «стола» эфира: /api/spaces/:id/live/cards.
 * Только участники пространства, только пока идёт эфир. Ссылки не загружаем (SSRF) — храним и показываем домен.
 */
import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { query, queryOne } from "../db.ts";
import { badRequest, conflict, forbidden, notFound } from "../http.ts";
import { assertSpaceMembership, currentUserId, requireAuth } from "../auth/middleware.ts";
import { assertVerified } from "../auth/verified.ts";
import { assertSize, detectMediaType, mediaPathFromUrl, saveChatMediaFile } from "../media/store.ts";
import {
  canAddCard, canDeleteCard, canResolve, toLiveCardDto, validateCardInput,
  type LiveCardRow, type ValidCard,
} from "../live/cards.ts";
import { getLiveInfo, publishCardAdded, publishCardRemoved, publishCardUpdated } from "../ws/live.ts";

const CARD_LIMIT = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
const idParam = z.object({ id: z.string().uuid() });
const cardParams = z.object({ id: z.string().uuid(), cardId: z.string().uuid() });
const jsonBody = z.object({
  kind: z.enum(["note", "link", "question"]),
  text: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  clientTempId: z.string().uuid(),
});
const statusBody = z.object({ status: z.enum(["open", "resolved"]) });
const COLUMNS = "id, kind, author_id, text, url, media_url, media_mime, status, created_at, client_temp_id";
const ENDED = "Эфир уже завершён";

function requireLive(spaceId: string) {
  const info = getLiveInfo(spaceId);
  if (!info) throw conflict(ENDED);
  return info;
}

async function findExisting(sessionId: string, userId: string, clientTempId: string) {
  return queryOne<LiveCardRow>(
    `SELECT ${COLUMNS} FROM live_cards WHERE session_id = $1 AND author_id = $2 AND client_temp_id = $3`,
    [sessionId, userId, clientTempId],
  );
}

async function assertRoom(sessionId: string) {
  const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM live_cards WHERE session_id = $1", [sessionId]);
  if (!canAddCard(row?.n ?? 0)) throw badRequest("На столе уже 40 карточек — уберите лишние");
}

export async function liveCardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { id: string } }>("/:id/live/cards", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);
    const info = getLiveInfo(id);
    if (!info) return { active: false, cards: [] };
    const rows = await query<LiveCardRow>(`SELECT ${COLUMNS} FROM live_cards WHERE session_id = $1 ORDER BY created_at`, [info.sessionId]);
    return { active: true, cards: rows.map(toLiveCardDto) };
  });

  app.post<{ Params: { id: string } }>("/:id/live/cards", CARD_LIMIT, async (request, reply) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertSpaceMembership(userId, id);

    let clientTempId: string;
    let valid: ValidCard;
    let file: { buffer: Buffer; type: NonNullable<ReturnType<typeof detectMediaType>> } | null = null;

    if (request.isMultipart()) {
      await assertVerified(userId);
      requireLive(id);
      const parts = request.parts({ limits: { files: 1, fields: 3 } });
      let buffer: Buffer | null = null;
      let kind = "";
      let text = "";
      clientTempId = "";
      for await (const part of parts) {
        if (part.type === "file") buffer = await part.toBuffer();
        else if (part.fieldname === "kind") kind = String(part.value);
        else if (part.fieldname === "clientTempId") clientTempId = String(part.value);
        else if (part.fieldname === "text") text = String(part.value);
      }
      if (kind !== "photo") throw badRequest("Файлом можно отправить только фото");
      if (!z.string().uuid().safeParse(clientTempId).success) throw badRequest("Поле clientTempId должно быть UUID");
      if (!buffer || buffer.length < 512) throw badRequest("Файл пустой — выберите другой");
      const type = detectMediaType(buffer);
      if (!type || type.kind !== "photo") throw badRequest("Поддерживаем только фото JPEG/PNG/WebP");
      assertSize(type, buffer.length);
      const check = validateCardInput({ kind: "photo", text, hasMedia: true });
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

    // Эфир мог закончиться, пока читали файл.
    const info = requireLive(id);
    const existing = await findExisting(info.sessionId, userId, clientTempId);
    if (existing) return toLiveCardDto(existing);
    await assertRoom(info.sessionId);

    const saved = file ? await saveChatMediaFile(userId, file.buffer, file.type) : null;
    try {
      const row = await queryOne<LiveCardRow>(
        `INSERT INTO live_cards (session_id, author_id, kind, text, url, media_url, media_mime, client_temp_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (session_id, author_id, client_temp_id) DO NOTHING
         RETURNING ${COLUMNS}`,
        [info.sessionId, userId, valid.kind, valid.text, valid.url, saved?.url ?? null, file?.type.mime ?? null, clientTempId],
      );
      if (!row) {
        // Параллельный повтор успел раньше — отдаём его карточку.
        if (saved) await unlink(saved.filePath).catch(() => undefined);
        const again = await findExisting(info.sessionId, userId, clientTempId);
        if (!again) throw conflict(ENDED);
        return toLiveCardDto(again);
      }
      if (!getLiveInfo(id) || getLiveInfo(id)?.sessionId !== info.sessionId) {
        // Сессию закрыли во время вставки — убираем за собой.
        await query("DELETE FROM live_cards WHERE id = $1", [row.id]);
        if (saved) await unlink(saved.filePath).catch(() => undefined);
        throw conflict(ENDED);
      }
      const dto = toLiveCardDto(row);
      publishCardAdded(id, info.sessionId, dto);
      reply.code(201);
      return dto;
    } catch (error) {
      if (saved) await unlink(saved.filePath).catch(() => undefined);
      throw error;
    }
  });

  app.patch<{ Params: { id: string; cardId: string } }>("/:id/live/cards/:cardId", CARD_LIMIT, async (request) => {
    const userId = currentUserId(request);
    const { id, cardId } = cardParams.parse(request.params);
    await assertSpaceMembership(userId, id);
    const { status } = statusBody.parse(request.body ?? {});
    const info = requireLive(id);
    const card = await queryOne<LiveCardRow>(`SELECT ${COLUMNS} FROM live_cards WHERE id = $1 AND session_id = $2`, [cardId, info.sessionId]);
    if (!card) throw notFound("Карточка не найдена");
    if (!canResolve(userId, { authorId: card.author_id }, info.startedBy)) throw forbidden("Менять карточку может автор или ведущий эфира");
    const row = await queryOne<LiveCardRow>(`UPDATE live_cards SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [cardId, status]);
    if (!row) throw notFound("Карточка не найдена");
    const dto = toLiveCardDto(row);
    publishCardUpdated(id, info.sessionId, dto);
    return dto;
  });

  app.delete<{ Params: { id: string; cardId: string } }>("/:id/live/cards/:cardId", CARD_LIMIT, async (request) => {
    const userId = currentUserId(request);
    const { id, cardId } = cardParams.parse(request.params);
    await assertSpaceMembership(userId, id);
    const info = requireLive(id);
    const card = await queryOne<LiveCardRow>(`SELECT ${COLUMNS} FROM live_cards WHERE id = $1 AND session_id = $2`, [cardId, info.sessionId]);
    if (!card) throw notFound("Карточка не найдена");
    if (!canDeleteCard(userId, { authorId: card.author_id }, info.startedBy)) throw forbidden("Удалить карточку может автор или ведущий эфира");
    await query("DELETE FROM live_cards WHERE id = $1", [cardId]);
    if (card.media_url) {
      const filePath = mediaPathFromUrl(card.media_url);
      if (filePath) await unlink(filePath).catch(() => undefined);
    }
    publishCardRemoved(id, info.sessionId, cardId);
    return { ok: true, id: cardId };
  });
}
