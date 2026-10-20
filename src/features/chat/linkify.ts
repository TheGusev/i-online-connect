/** Поиск ссылок в тексте сообщения. Создаём только http/https. */
export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

// http(s)://…, www.… или домен.зона[/путь]; перед совпадением не должно быть «@» или буквы (e-mail, середина слова).
const LINK_RE = /(^|[^\p{L}\p{N}@._\/-])((?:https?:\/\/|www\.)[^\s<>]+|(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d+)?(?:\/[^\s<>]*)?)/giu;
const TRAILING = /[.,!?:;)»”"'\]]+$/u;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const lead = match[1] ?? "";
    let raw = match[2] ?? "";
    const start = (match.index ?? 0) + lead.length;
    // Хвостовая пунктуация, но закрывающую скобку оставляем, если внутри есть открывающая.
    const trail = raw.match(TRAILING)?.[0] ?? "";
    if (trail) raw = raw.slice(0, raw.length - trail.length);
    if (raw.includes("(") && trail.startsWith(")")) raw += ")";
    const end = start + raw.length;
    // E-mail: сразу после совпадения «@», либо это часть адреса до «@».
    if (text[end] === "@") continue;
    const href = toHref(raw);
    if (!href) continue;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: raw, href });
    last = end;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function toHref(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** IP вместо домена, punycode (xn--) или «@» в адресе — спросить перед открытием. */
export function isSuspiciousUrl(href: string): boolean {
  if (href.replace(/^https?:\/\//i, "").split(/[/?#]/)[0]!.includes("@")) return true;
  let host: string;
  try { host = new URL(href).hostname.toLowerCase(); } catch { return true; }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return true;
  return host.split(".").some((label) => label.startsWith("xn--"));
}

export function hostOf(href: string): string {
  try { return new URL(href).hostname; } catch { return href; }
}
