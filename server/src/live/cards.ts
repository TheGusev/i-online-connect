/** Чистые правила карточек «стола» эфира (без базы и файловой системы). */

export const MAX_CARDS_PER_SESSION = 40;
export const MAX_CARD_TEXT = 500;
export const MAX_CARD_URL = 500;

export type LiveCardKind = "photo" | "link" | "note" | "question";
export type LiveCardStatus = "open" | "resolved";

export type CardCheck<T> = { ok: true; value: T } | { ok: false; error: string };

/** Только http/https, ≤500 символов, без логина/пароля и управляющих символов. Ссылку не загружаем. */
export function normalizeLinkUrl(raw: string): CardCheck<{ url: string; domain: string }> {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, error: "Укажите ссылку" };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(input)) return { ok: false, error: "Ссылка содержит недопустимые символы" };
  if (input.length > MAX_CARD_URL) return { ok: false, error: "Ссылка длиннее 500 символов" };
  let parsed: URL;
  try { parsed = new URL(input); } catch { return { ok: false, error: "Некорректная ссылка" }; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, error: "Разрешены только ссылки http и https" };
  if (parsed.username || parsed.password) return { ok: false, error: "Ссылка не должна содержать логин и пароль" };
  if (!parsed.hostname) return { ok: false, error: "Некорректная ссылка" };
  const url = parsed.toString();
  if (url.length > MAX_CARD_URL) return { ok: false, error: "Ссылка длиннее 500 символов" };
  return { ok: true, value: { url, domain: parsed.hostname.replace(/^www\./, "") } };
}

export interface CardInput { kind: LiveCardKind; text?: string | undefined; url?: string | undefined; hasMedia?: boolean }
export interface ValidCard { kind: LiveCardKind; text: string; url: string | null; domain: string | null }

/** Проверка полей по виду: note/question — текст 1–500; link — ссылка (+ подпись ≤500); photo — файл (+ подпись ≤500). */
export function validateCardInput(input: CardInput): CardCheck<ValidCard> {
  const text = (input.text ?? "").trim();
  if (text.length > MAX_CARD_TEXT) return { ok: false, error: "Текст длиннее 500 символов" };
  switch (input.kind) {
    case "note":
    case "question":
      if (!text) return { ok: false, error: "Напишите текст" };
      return { ok: true, value: { kind: input.kind, text, url: null, domain: null } };
    case "link": {
      const link = normalizeLinkUrl(input.url ?? "");
      if (!link.ok) return link;
      return { ok: true, value: { kind: "link", text, url: link.value.url, domain: link.value.domain } };
    }
    case "photo":
      if (!input.hasMedia) return { ok: false, error: "Прикрепите фото" };
      return { ok: true, value: { kind: "photo", text, url: null, domain: null } };
    default:
      return { ok: false, error: "Неизвестный вид карточки" };
  }
}

export function canAddCard(countInSession: number): boolean {
  return countInSession < MAX_CARDS_PER_SESSION;
}

/** Удалить может автор карточки или начавший эфир. */
export function canDeleteCard(userId: string, card: { authorId: string }, startedBy: string | null): boolean {
  return userId === card.authorId || (startedBy !== null && userId === startedBy);
}

/** Отметить решённой / вернуть может автор или начавший эфир. */
export function canResolve(userId: string, card: { authorId: string }, startedBy: string | null): boolean {
  return canDeleteCard(userId, card, startedBy);
}

export interface LiveCardRow {
  id: string;
  kind: LiveCardKind;
  author_id: string;
  text: string;
  url: string | null;
  media_url: string | null;
  media_mime: string | null;
  status: LiveCardStatus;
  created_at: Date | string;
  client_temp_id: string;
}

export interface LiveCardDto {
  id: string;
  kind: LiveCardKind;
  authorId: string;
  text: string;
  url?: string;
  domain?: string;
  mediaUrl?: string;
  mediaMime?: string;
  status: LiveCardStatus;
  createdAt: string;
  clientTempId: string;
}

export function toLiveCardDto(row: LiveCardRow): LiveCardDto {
  const dto: LiveCardDto = {
    id: row.id,
    kind: row.kind,
    authorId: row.author_id,
    text: row.text,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    clientTempId: row.client_temp_id,
  };
  if (row.url) {
    dto.url = row.url;
    const link = normalizeLinkUrl(row.url);
    if (link.ok) dto.domain = link.value.domain;
  }
  if (row.media_url) dto.mediaUrl = row.media_url;
  if (row.media_mime) dto.mediaMime = row.media_mime;
  return dto;
}
