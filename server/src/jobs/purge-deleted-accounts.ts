/**
 * Окончательное удаление аккаунтов после окна восстановления.
 *
 * Мягкое удаление (users.deleted_at) только скрывает аккаунт. Эта задача
 * физически стирает данные: строки в БД (каскадом от users) и файлы на диске.
 * Если база отказала (неожиданная связь), транзакция откатывается, ошибка
 * пишется в лог, аккаунт будет обработан в следующий запуск.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";

import { query, queryOne, transaction } from "../db.ts";
import { env } from "../env.ts";
import { removeDocument } from "../media/documents.ts";

const BATCH = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_KEY = /^[0-9a-f-]{36}\.[a-z0-9]+$/;
let running = false;

async function documentKeys(userId: string): Promise<string[]> {
  const keys: string[] = [];
  for (const table of ["messages", "space_messages"]) {
    const rows = await query<{ media_url: string | null }>(
      `SELECT media_url FROM ${table}
        WHERE author_id = $1 AND kind::text = 'file' AND media_url IS NOT NULL`,
      [userId],
    );
    for (const row of rows) {
      const key = path.basename(row.media_url ?? "");
      if (DOCUMENT_KEY.test(key)) keys.push(key);
    }
  }
  return keys;
}

async function purgeOne(userId: string, log: FastifyBaseLogger): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const user = await queryOne<{ email: string }>(
    "SELECT email::text AS email FROM users WHERE id = $1 AND deleted_at IS NOT NULL",
    [userId],
  );
  if (!user) return false;
  const keys = await documentKeys(userId);

  await transaction(async (client) => {
    const hosted = await client.query<{ id: string }>(
      "SELECT id FROM spaces WHERE host_id = $1 FOR UPDATE",
      [userId],
    );
    for (const space of hosted.rows) {
      const next = await client.query<{ user_id: string }>(
        `SELECT m.user_id FROM space_members m JOIN users u ON u.id = m.user_id
          WHERE m.space_id = $1 AND m.user_id <> $2
            AND m.status IN ('member', 'host') AND u.deleted_at IS NULL
          ORDER BY m.joined_at LIMIT 1`,
        [space.id, userId],
      );
      const heir = next.rows[0]?.user_id;
      if (heir) {
        await client.query("UPDATE spaces SET host_id = $1 WHERE id = $2", [heir, space.id]);
        await client.query(
          "UPDATE space_members SET status = 'host' WHERE space_id = $1 AND user_id = $2",
          [space.id, heir],
        );
      } else {
        await client.query("DELETE FROM spaces WHERE id = $1", [space.id]);
      }
    }
    await client.query("DELETE FROM users WHERE id = $1 AND deleted_at IS NOT NULL", [userId]);
    await client.query("DELETE FROM login_attempts WHERE email = $1", [user.email]);
    await client.query(
      `DELETE FROM conversations c
        WHERE c.created_at < now() - interval '1 hour'
          AND NOT EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id)`,
    );
  });

  const media = path.resolve(env.MEDIA_DIR);
  const dirs = [
    path.join(media, userId),
    path.join(media, "voice", userId),
    path.join(media, "chat", userId),
    path.join(media, "listings", userId),
    path.join(path.resolve(env.VERIFICATION_DIR), userId),
  ];
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true }).catch((error: unknown) =>
      log.error(`[account-purge] не удалось удалить ${dir}: ${String(error)}`),
    );
  }
  for (const key of keys) {
    await removeDocument(key).catch((error: unknown) =>
      log.error(`[account-purge] не удалось удалить документ ${key}: ${String(error)}`),
    );
  }
  return true;
}

export async function runAccountPurge(log: FastifyBaseLogger): Promise<void> {
  if (running) return;
  running = true;
  try {
    const days = Number(env.ACCOUNT_RESTORE_DAYS) || 30;
    const rows = await query<{ id: string }>(
      `SELECT u.id FROM users u
        WHERE u.deleted_at IS NOT NULL
          AND u.role::text <> 'admin'
          AND COALESCE(
                (SELECT max(d.restore_until) FROM deletion_requests d WHERE d.user_id = u.id),
                u.deleted_at + make_interval(days => $1::int)
              ) < now()
        ORDER BY u.deleted_at
        LIMIT ${BATCH}`,
      [days],
    );
    const dry = process.env["ACCOUNT_PURGE_DRY_RUN"] === "1";
    log.info(`[account-purge] к удалению: ${rows.length}${dry ? " (пробный запуск)" : ""}`);
    for (const row of rows) {
      if (dry) continue;
      try {
        if (await purgeOne(row.id, log)) log.info(`[account-purge] удалён аккаунт ${row.id}`);
      } catch (error) {
        log.error(`[account-purge] аккаунт ${row.id} пропущен: ${String(error)}`);
      }
    }
  } catch (error) {
    log.error(`[account-purge] запуск не удался: ${String(error)}`);
  } finally {
    running = false;
  }
}
