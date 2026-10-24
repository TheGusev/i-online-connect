/**
 * Безопасная загрузка чужих страниц (предпросмотр ссылок).
 *
 * Защита от SSRF по IP, а не по имени: перед каждым запросом хост
 * резолвится через dns.promises.lookup({all:true}) и отклоняется, если
 * ЛЮБОЙ адрес приватный/служебный. redirect: "manual" — максимум 3
 * перехода, на каждом заново проверяются схема (только http/https),
 * хост, порт (только 80/443) и IP.
 *
 * Отступление от ТЗ: undici не установлен в server/ (новых библиотек не
 * добавляем), поэтому соединение идёт штатным fetch Node 22 без
 * закрепления адреса на connect; проверка DNS повторяется непосредственно
 * перед каждым запросом, что сужает окно DNS-подмены, но не закрывает его
 * полностью.
 */
import dns from "node:dns";
import net from "node:net";

export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 64 * 1024;
export const TOTAL_TIMEOUT_MS = 5_000;
/** Не больше 5 одновременных запросов к чужим сайтам на процесс. */
export const MAX_CONCURRENT = 5;

let inFlight = 0;

/** Нормализация хоста: без завершающей точки, нижний регистр. null — хост запрещён. */
export function normalizeHost(raw: string): string | null {
  let host = raw.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  while (host.endsWith(".")) host = host.slice(0, -1);
  if (host.length === 0) return null;
  // IP-адреса не нормализуем как имена — их проверяет isPublicAddress.
  if (net.isIP(host)) return host;
  if (!host.includes(".")) return null;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home.arpa")
  ) {
    return null;
  }
  return host;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = parts[0] as number;
  const b = parts[1] as number;
  const c = parts[2] as number;
  if (a === 0) return true; // 0.0.0.0/8 «этот хост»
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF, TEST-NET-1)
  if (a === 192 && b === 88) return true; // 192.88.99.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast 224/4 и зарезервированный 240/4
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified, loopback
  // IPv4-mapped (::ffff:a.b.c.d) проверяем как IPv4.
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1] as string);
  // Разворачиваем сокращение :: и смотрим первые группы.
  const expanded = expandIPv6(lower);
  if (!expanded) return true;
  const groups = expanded.split(":").map((g) => parseInt(g, 16));
  const first = groups[0] as number;
  const second = groups[1] as number;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x2001 && second === 0x0db8) return true; // documentation
  if (first === 0x64 && second === 0xff9b) return true; // 64:ff9b::/96 NAT64
  if (first === 0 && second === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0xffff) {
    // Развёрнутый IPv4-mapped (::ffff:0:0/96) — проверяем хвост как IPv4.
    const g6 = groups[6] as number;
    const g7 = groups[7] as number;
    return isPrivateIPv4(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`);
  }
  if (first === 0 && second === 0) return true; // ::/96 deprecated compatible
  return false;
}

function expandIPv6(ip: string): string | null {
  if (ip.includes(".")) {
    // Хвост в виде IPv4 — переводим в две группы.
    const lastColon = ip.lastIndexOf(":");
    if (lastColon < 0) return null;
    const v4 = ip.slice(lastColon + 1);
    const parts = v4.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = (((parts[0] as number) << 8) | (parts[1] as number)).toString(16);
    const lo = (((parts[2] as number) << 8) | (parts[3] as number)).toString(16);
    ip = `${ip.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const full = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (full.length !== 8 || full.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return full.map((g) => g.padStart(4, "0")).join(":");
}

/** true, если адрес публичный и к нему можно подключаться. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !isPrivateIPv4(address);
  if (family === 6) return !isPrivateIPv6(address);
  return false;
}

/** Резолв хоста с проверкой: пустой список, если ЛЮБОЙ адрес непубличный. */
export async function resolvePublicAddresses(host: string): Promise<string[]> {
  if (net.isIP(host)) {
    return isPublicAddress(host) ? [host] : [];
  }
  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    return [];
  }
  if (records.length === 0) return [];
  for (const record of records) {
    if (!isPublicAddress(record.address)) return [];
  }
  return records.map((r) => r.address);
}

/** URL, который разрешено загружать: http(s), порт 80/443, чистый хост. */
export function safeUrl(raw: string | URL): URL | null {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw) : raw;
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const port = url.port === "" ? (url.protocol === "https:" ? "443" : "80") : url.port;
  if (port !== "80" && port !== "443") return null;
  const host = normalizeHost(url.hostname);
  if (!host) return null;
  // Хост-IP допустим, только если он публичный.
  if (net.isIP(host) && !isPublicAddress(host)) return null;
  return url;
}

export interface SafeFetchResult {
  /** Декодированное тело (не больше MAX_BYTES или до </head>). */
  text: string;
  /** Финальный URL после переходов. */
  url: URL;
}

export class BusyError extends Error {
  constructor() {
    super("busy");
    this.name = "BusyError";
  }
}

function charsetOf(contentType: string | null): string {
  if (!contentType) return "utf-8";
  const match = /charset\s*=\s*"?([a-z0-9_-]+)"?/i.exec(contentType);
  const label = match?.[1]?.toLowerCase();
  if (!label) return "utf-8";
  try {
    // Проверяем, что TextDecoder знает кодировку (windows-1251 и т.п.).
    new TextDecoder(label);
    return label;
  } catch {
    return "utf-8";
  }
}

const HEAD_END = new TextEncoder().encode("</head");

/** Грубый поиск </head в сырых байтах (ascii-совместимые кодировки). */
function includesHeadEnd(chunk: Uint8Array): boolean {
  outer: for (let i = 0; i + HEAD_END.length <= chunk.byteLength; i++) {
    for (let j = 0; j < HEAD_END.length; j++) {
      const a = (chunk[i + j] as number) | 0x20; // ascii lower
      const b = HEAD_END[j] as number;
      if (a !== b) continue outer;
    }
    return true;
  }
  return false;
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let headClosed = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (!headClosed && includesHeadEnd(value)) headClosed = true;
    if (size >= MAX_BYTES || headClosed) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const total = Math.min(size, MAX_BYTES);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, total - offset));
    bytes.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= total) break;
  }
  const charset = charsetOf(response.headers.get("content-type"));
  return new TextDecoder(charset).decode(bytes);
}

/**
 * Загрузить HTML страницы со всеми проверками. Бросает BusyError, если
 * все слоты заняты; возвращает null при любой сетевой/проверочной ошибке.
 */
export async function safeFetchHtml(raw: string): Promise<SafeFetchResult | null> {
  if (inFlight >= MAX_CONCURRENT) throw new BusyError();
  let url = safeUrl(raw);
  if (!url) return null;
  inFlight += 1;
  const started = Date.now();
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Проверка IP перед каждым запросом (и на каждом переходе).
      const host = normalizeHost(url.hostname);
      if (!host) return null;
      const addresses = await resolvePublicAddresses(host);
      if (addresses.length === 0) return null;
      const remaining = TOTAL_TIMEOUT_MS - (Date.now() - started);
      if (remaining <= 0) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            Accept: "text/html",
            "User-Agent": "YaOnlineBot/1.0 (+link-preview)",
          },
        });
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) return null;
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          return null;
        }
        const checked = safeUrl(next);
        if (!checked) return null;
        url = checked;
        continue;
      }
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("text/html")) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const text = await readLimited(response);
      return { text, url };
    }
    return null; // слишком много переходов
  } finally {
    inFlight -= 1;
  }
}
