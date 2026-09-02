/**
 * Доступ администратора и аудит.
 *
 * Правило: скрытый путь и отсутствие кнопки в интерфейсе — не защита.
 * Каждый /api/admin/* маршрут проходит requireAdmin, который требует
 * отдельный короткий админский токен (пароль + TOTP, см. admin-tokens.ts).
 * Роль читается из БД на каждом запросе — снятую роль выданный ранее токен
 * «носить» не должен.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { query, queryOne } from "../db.ts";
import { env } from "../env.ts";
import { forbidden } from "../http.ts";
import { verifyAdminToken } from "./admin-tokens.ts";

declare module "fastify" {
  interface FastifyRequest {
    adminId?: string;
  }
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers["x-admin-token"];
  const token = typeof header === "string" ? header.trim() : "";
  // Обычному пользователю не сообщаем, что раздел вообще существует:
  // одинаковый 403 и при отсутствии токена, и при недостаточной роли.
  if (!token) throw forbidden("Нет доступа");

  const { sub } = await verifyAdminToken(token);

  const row = await queryOne<{ role: string; blocked_at: string | null }>(
    "SELECT role, blocked_at FROM users WHERE id = $1 AND deleted_at IS NULL",
    [sub],
  );
  if (row?.role !== "admin" || row.blocked_at) throw forbidden("Нет доступа");

  request.adminId = sub;
  request.userId = sub;
}

/** adminId после requireAdmin. */
export function currentAdminId(request: FastifyRequest): string {
  if (!request.adminId) throw forbidden("Нет доступа");
  return request.adminId;
}


/** Запись в журнал действий администратора (таблица admin_actions). */
export async function logAdminAction(
  request: FastifyRequest,
  action: string,
  targetType: "user" | "report" | "verification" | "support" | "listing" | "space",
  targetId: string | null,
  note = "",
): Promise<void> {
  await query(
    `INSERT INTO admin_actions (admin_id, action, target_type, target_id, note, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [currentAdminId(request), action, targetType, targetId, note, request.ip],
  );
}

/**
 * Аудит-лог доступа: отдельный файл, только метаданные запроса.
 * Тела и заголовки не пишем — там пароли, коды и персональные данные.
 */
export function registerAdminAuditLog(app: FastifyInstance) {
  const file = env.ADMIN_LOG_FILE;
  let ready: Promise<void> | null = null;

  const ensureDir = () => {
    ready ??= mkdir(path.dirname(file), { recursive: true }).then(() => undefined);
    return ready;
  };

  app.addHook("onResponse", async (request, reply) => {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      method: request.method,
      path: request.url,
      status: reply.statusCode,
      userId: request.userId ?? null,
      ip: request.ip,
      ms: Math.round(reply.elapsedTime),
    });
    try {
      await ensureDir();
      await appendFile(file, `${line}\n`, "utf8");
    } catch (error) {
      // Недоступный файл журнала не должен ломать ответ админу,
      // но обязан попасть в общий лог приложения.
      request.log.error({ err: error }, "[admin] не удалось записать аудит-лог");
    }
  });
}
