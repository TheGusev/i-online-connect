/**
 * GET /api/link-preview?url=... — компактный предпросмотр ссылки из чата:
 * название страницы и домен (og:title / <title>). Картинки не отдаём:
 * клиент никогда не должен напрямую грузить чужие изображения.
 *
 * Кэш в памяти процесса на 30 минут. SSRF-защита — в security/safe-fetch.ts:
 * проверка IP после резолва, только порты 80/443, ручные переходы (максимум 3),
 * 64 КБ или до </head>, общий таймаут 5 с, не больше 5 одновременных запросов.
 * Rate limit: 20 запросов в минуту на пользователя.
 */
import type { FastifyInstance } from "fastify";

import { BusyError, safeFetchHtml, safeUrl } from "../security/safe-fetch.ts";

export interface LinkPreview {
  url: string;
  title: string | null;
  domain: string;
}

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 500;
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_WINDOW_MS = 60_000;
/** Один тег не длиннее 1000 символов. */
const MAX_TAG_LENGTH = 1000;

const cache = new Map<string, { at: number; value: LinkPreview | null }>();
const rateBuckets = new Map<string, number[]>();

function cached(url: string): LinkPreview | null | undefined {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(url);
    return undefined;
  }
  return hit.value;
}

function remember(url: string, value: LinkPreview | null) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { at: Date.now(), value });
}

/** true, если пользователь уложился в 20 запросов в минуту. */
export function rateLimitOk(userId: string, now = Date.now()): boolean {
  const bucket = (rateBuckets.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(userId, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(userId, bucket);
  // Чистим давно неактивных, чтобы карта не росла бесконечно.
  if (rateBuckets.size > 1000) {
    for (const [key, hits] of rateBuckets) {
      if (hits.length === 0 || now - (hits[hits.length - 1] as number) > RATE_WINDOW_MS) {
        rateBuckets.delete(key);
      }
    }
  }
  return true;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/**
 * Линейный поиск следующего тега без регулярных выражений с возвратом:
 * indexOf по "<title" / "<meta", конец тега — ближайший ">", тег не
 * длиннее MAX_TAG_LENGTH. Длинная строка из "<meta" без ">" не зависает.
 */
function findTag(html: string, name: "title" | "meta", from: number): { tag: string; start: number; end: number } | null {
  const needle = `<${name}`;
  let pos = from;
  for (;;) {
    const start = html.indexOf(needle, pos);
    if (start < 0) return null;
    // Граница тега: после имени идёт пробел, ">", "/" или таб/перевод строки.
    const after = html[start + needle.length];
    if (after !== undefined && after !== ">" && after !== "/" && after !== " " && after !== "\t" && after !== "\n" && after !== "\r") {
      pos = start + needle.length;
      continue;
    }
    let end = html.indexOf(">", start);
    if (end < 0 || end - start > MAX_TAG_LENGTH) {
      // Тег не закрыт или слишком длинный — пропускаем его начало.
      return { tag: html.slice(start, end < 0 ? Math.min(html.length, start + MAX_TAG_LENGTH) : end + 1), start, end: -1 };
    }
    return { tag: html.slice(start, end + 1), start, end: end + 1 };
  }
}

/** Атрибут тега: attr="..." или attr='...', линейный поиск. */
function attrValue(tag: string, attr: string): string | null {
  const lower = tag.toLowerCase();
  let pos = 0;
  for (;;) {
    const at = lower.indexOf(attr, pos);
    if (at < 0) return null;
    const before = at === 0 ? " " : lower[at - 1];
    const after = lower[at + attr.length];
    if ((before === " " || before === "\t" || before === "\n") && (after === "=" || after === " " || after === "\t")) {
      let eq = at + attr.length;
      while (lower[eq] === " " || lower[eq] === "\t") eq++;
      if (lower[eq] !== "=") {
        pos = at + attr.length;
        continue;
      }
      eq++;
      while (lower[eq] === " " || lower[eq] === "\t") eq++;
      const quote = lower[eq];
      if (quote !== '"' && quote !== "'") {
        pos = eq;
        continue;
      }
      const close = lower.indexOf(quote, eq + 1);
      if (close < 0) return null;
      return tag.slice(eq + 1, close);
    }
    pos = at + attr.length;
  }
}

/** Вытащить название страницы из HTML (og:title или <title>). */
export function parsePreview(html: string, url: URL): LinkPreview {
  let title: string | null = null;
  let pos = 0;
  // Идём по тегам <meta> по порядку: первый og:title побеждает.
  for (;;) {
    const found = findTag(html, "meta", pos);
    if (!found) break;
    if (found.end < 0) break; // незакрытый/слишком длинный тег — дальше не ищем
    pos = found.end;
    const property = attrValue(found.tag, "property") ?? attrValue(found.tag, "name");
    if (property?.toLowerCase() === "og:title") {
      const content = attrValue(found.tag, "content");
      if (content && content.trim().length > 0) {
        title = decodeEntities(content.trim());
        break;
      }
    }
  }
  if (!title) {
    const found = findTag(html, "title", 0);
    if (found && found.end > 0) {
      const close = html.toLowerCase().indexOf("</title", found.end);
      const inner = html.slice(found.end, close < 0 ? Math.min(html.length, found.end + MAX_TAG_LENGTH) : close).trim();
      if (inner.length > 0) title = decodeEntities(inner);
    }
  }
  return {
    url: url.toString(),
    title: title && title.length > 0 ? title.slice(0, 200) : null,
    domain: url.hostname.replace(/^www\./i, ""),
  };
}

async function fetchPreview(url: URL): Promise<LinkPreview | null> {
  const result = await safeFetchHtml(url.toString());
  if (!result) return null;
  return parsePreview(result.text, result.url);
}

export async function linkPreviewRoutes(app: FastifyInstance) {
  // Ленивый импорт: middleware тянет БД, а чистые функции выше должны
  // оставаться тестируемыми без неё.
  const { requireAuth, currentUserId } = await import("../auth/middleware.ts");
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: { url?: string } }>("/", async (request, reply) => {
    const userId = currentUserId(request);
    if (!rateLimitOk(userId)) {
      return reply.code(429).send({ message: "Слишком много запросов, подождите минуту" });
    }
    const raw = request.query.url ?? "";
    const url = safeUrl(raw);
    if (!url) {
      return reply.code(400).send({ message: "Недопустимая ссылка" });
    }
    const key = url.toString();
    const hit = cached(key);
    if (hit !== undefined) {
      return hit ?? reply.code(404).send({ message: "Предпросмотр недоступен" });
    }
    let preview: LinkPreview | null;
    try {
      preview = await fetchPreview(url);
    } catch (error) {
      if (error instanceof BusyError) {
        return reply.code(429).send({ message: "Сервер занят, попробуйте позже" });
      }
      throw error;
    }
    remember(key, preview);
    if (!preview || !preview.title) {
      remember(key, null);
      return reply.code(404).send({ message: "Предпросмотр недоступен" });
    }
    return preview;
  });
}
