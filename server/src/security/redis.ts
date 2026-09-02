/**
 * Общее хранилище счётчиков rate limit.
 *
 * Зачем Redis: счётчики в памяти процесса сбрасываются при перезапуске PM2
 * и не видны другим инстансам — лимит обходится простым «подождать reload».
 * Redis решает и то, и другое.
 *
 * Адрес не захардкожен: REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB.
 * Пока REDIS_HOST пуст — работаем на счётчиках в памяти и предупреждаем в лог.
 */
import { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

import { env } from "../env.ts";

let client: Redis | null = null;

export function getRedis(log: FastifyBaseLogger): Redis | null {
  if (!env.redisEnabled) {
    log.warn(
      "[rate-limit] REDIS_HOST не задан: счётчики лимитов живут в памяти процесса " +
        "и сбрасываются при перезапуске. Укажите REDIS_* в server/.env.",
    );
    return null;
  }
  if (client) return client;

  client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    db: env.REDIS_DB,
    // @fastify/rate-limit требует, чтобы команды не копились в очереди,
    // если Redis недоступен: лучше пропустить проверку, чем повесить запрос.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    keyPrefix: "ya-rl:",
  });

  client.on("error", (error: Error) => {
    // Пароль и адрес в лог не пишем — только текст ошибки.
    log.error({ err: error.message }, "[rate-limit] Redis недоступен");
  });
  client.on("ready", () => log.info("[rate-limit] Redis подключён"));

  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => undefined);
  client = null;
}
