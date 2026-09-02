/**
 * Журнал подозрительной активности.
 *
 * Пишем каждый ответ 429 (сработал лимит) и 403 (попытка залезть туда,
 * куда нельзя) отдельной строкой JSON в ABUSE_LOG_FILE. Если с одного IP
 * набирается 20+ таких событий за 5 минут — отдельная строка уровня warn
 * в общий лог приложения: это уже похоже на атаку, а не на опечатку.
 *
 * Тела запросов, заголовки и токены в этот файл не попадают.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { env } from "../env.ts";

const WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = 20;

// Скользящее окно по IP. Память ограничена: старые метки вычищаются.
const hits = new Map<string, number[]>();
const alerted = new Map<string, number>();

function track(ip: string): number {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5000) {
    for (const [key, marks] of hits) {
      if (marks.length === 0 || now - marks[marks.length - 1]! > WINDOW_MS) hits.delete(key);
    }
  }
  return recent.length;
}

export function registerAbuseLog(app: FastifyInstance) {
  const file = env.ABUSE_LOG_FILE;
  let ready: Promise<void> | null = null;
  const ensureDir = () => {
    ready ??= mkdir(path.dirname(file), { recursive: true }).then(() => undefined);
    return ready;
  };

  app.addHook("onResponse", async (request, reply) => {
    const status = reply.statusCode;
    if (status !== 429 && status !== 403) return;

    const count = track(request.ip);
    const suspicious = count >= ALERT_THRESHOLD;

    const line = JSON.stringify({
      at: new Date().toISOString(),
      ip: request.ip,
      method: request.method,
      path: request.url,
      status,
      userAgent: request.headers["user-agent"] ?? null,
      hitsInWindow: count,
      alert: suspicious,
    });

    try {
      await ensureDir();
      await appendFile(file, `${line}\n`, "utf8");
    } catch (error) {
      request.log.error({ err: error }, "[abuse] не удалось записать журнал");
    }

    // Предупреждаем не чаще раза в 5 минут на IP, чтобы не залить лог.
    const lastAlert = alerted.get(request.ip) ?? 0;
    if (suspicious && Date.now() - lastAlert > WINDOW_MS) {
      alerted.set(request.ip, Date.now());
      request.log.warn(
        { ip: request.ip, hits: count, path: request.url },
        "[abuse] возможная атака: много отказов с одного адреса",
      );
    }
  });
}
