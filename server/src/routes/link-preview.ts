/**
 * GET /api/link-preview?url=... — компактный предпросмотр ссылки из чата:
 * название страницы, домен и картинка (og:title / og:image / <title>).
 *
 * Кэш в памяти процесса на 30 минут. SSRF-ограничения: только http(s),
 * без IP-адресов и служебных хостов, таймаут 5 с, читаем не больше 256 КБ.
 */
import type { FastifyInstance } from "fastify";

import { requireAuth } from "../auth/middleware.ts";

export interface LinkPreview {
  url: string;
  title: string | null;
  image: string | null;
  domain: string;
}

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 500;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 256 * 1024;

const cache = new Map<string, { at: number; value: LinkPreview | null }>();

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

/** Только http(s), без IP и служебных хостов — защита от SSRF. */
export function previewableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return null;
  return url;
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

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content.trim()) : null;
}

/** Вытащить название и картинку из HTML страницы. */
export function parsePreview(html: string, url: URL): LinkPreview {
  const ogTitle = metaContent(html, "og:title");
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title = ogTitle ?? (titleTag ? decodeEntities(titleTag.trim()) : null);
  let image = metaContent(html, "og:image");
  if (image) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = null;
    }
  }
  return {
    url: url.toString(),
    title: title && title.length > 0 ? title.slice(0, 200) : null,
    image,
    domain: url.hostname.replace(/^www\./i, ""),
  };
}

async function fetchPreview(url: URL): Promise<LinkPreview | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html",
        "User-Agent": "YaOnlineBot/1.0 (+link-preview)",
      },
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("text/html")) return null;
    // Читаем не больше MAX_BYTES, чтобы не грузить большие страницы целиком.
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
      if (size >= MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    const html = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0]! : concat(chunks),
    );
    return parsePreview(html, url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function linkPreviewRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: { url?: string } }>("/", async (request, reply) => {
    const raw = request.query.url ?? "";
    const url = previewableUrl(raw);
    if (!url) {
      return reply.code(400).send({ message: "Недопустимая ссылка" });
    }
    const key = url.toString();
    const hit = cached(key);
    if (hit !== undefined) {
      return hit ?? reply.code(404).send({ message: "Предпросмотр недоступен" });
    }
    const preview = await fetchPreview(url);
    remember(key, preview);
    if (!preview || !preview.title) {
      remember(key, null);
      return reply.code(404).send({ message: "Предпросмотр недоступен" });
    }
    return preview;
  });
}
