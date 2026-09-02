/**
 * Проверка `Authorization: Bearer <access token>`.
 *
 * ВАЖНО: защита должна стоять на каждом эндпоинте, который читает или пишет
 * личные данные. Скрытая кнопка в интерфейсе — не защита: HTTP-эндпоинт
 * доступен напрямую.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

import { queryOne } from "../db.ts";
import { forbidden, unauthorized } from "../http.ts";
import { verifyAccessToken } from "./tokens.ts";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();

  const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());

  // Аккаунт мог быть удалён или поставлен на паузу уже после выдачи токена.
  const user = await queryOne<{ id: string; deleted_at: Date | null; blocked_at: Date | null }>(
    "SELECT id, deleted_at, blocked_at FROM users WHERE id = $1",
    [claims.sub],
  );
  if (!user) throw unauthorized("Аккаунт не найден");
  if (user.deleted_at) throw forbidden("Аккаунт удалён");
  // Блокировка модератором действует сразу, не дожидаясь истечения токена.
  if (user.blocked_at) throw forbidden("Аккаунт заблокирован модератором");

  request.userId = user.id;
}

/** userId после requireAuth. Бросает, если хук забыли повесить. */
export function currentUserId(request: FastifyRequest): string {
  if (!request.userId) throw unauthorized();
  return request.userId;
}

/**
 * userId для публичных эндпоинтов: если токен есть и он валиден — вернём id,
 * иначе null. Ничего не бросает: гость тоже имеет право на запрос.
 */
export async function optionalUserId(request: FastifyRequest): Promise<string | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
    const user = await queryOne<{ id: string; deleted_at: Date | null; blocked_at: Date | null }>(
      "SELECT id, deleted_at, blocked_at FROM users WHERE id = $1",
      [claims.sub],
    );
    return user && !user.deleted_at && !user.blocked_at ? user.id : null;
  } catch {
    return null;
  }
}


/** Участвует ли пользователь в диалоге. Вызывать перед любым чтением чата. */
export async function assertConversationAccess(
  userId: string,
  conversationId: string,
): Promise<void> {
  const row = await queryOne(
    `SELECT 1 FROM conversation_participants
      WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  if (!row) throw forbidden("Это не ваш диалог");
}

/** Является ли пользователь участником сообщества. */
export async function assertSpaceMembership(userId: string, spaceId: string): Promise<void> {
  const row = await queryOne(
    `SELECT 1 FROM space_members
      WHERE space_id = $1 AND user_id = $2 AND status IN ('member', 'host')`,
    [spaceId, userId],
  );
  if (!row) throw forbidden("Нужно быть участником сообщества");
}
