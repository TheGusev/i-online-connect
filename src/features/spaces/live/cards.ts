/** Чистые правила карточек «стола» эфира на клиенте. */
import type { LiveCard } from "@/api/types";

export const MAX_CARD_TEXT = 500;
export const TABLE_CARDS = 4;

export type CardEvent =
  | { type: "card_added"; card: LiveCard }
  | { type: "card_updated"; card: LiveCard }
  | { type: "card_removed"; cardId: string };

/** Добавить или заменить карточку (по id или clientTempId оптимистичной копии). */
export function upsertCard(cards: LiveCard[], card: LiveCard): LiveCard[] {
  const at = cards.findIndex((c) => c.id === card.id || c.clientTempId === card.clientTempId);
  if (at === -1) return [...cards, card];
  const next = cards.slice();
  next[at] = card;
  return next;
}

export function applyCardEvent(cards: LiveCard[], event: CardEvent): LiveCard[] {
  switch (event.type) {
    case "card_added": return upsertCard(cards, event.card);
    case "card_updated": return cards.some((c) => c.id === event.card.id) ? cards.map((c) => (c.id === event.card.id ? event.card : c)) : cards;
    case "card_removed": return cards.filter((c) => c.id !== event.cardId);
  }
}

/** Откат оптимистичной карточки, если сервер её не принял. */
export function dropOptimistic(cards: LiveCard[], clientTempId: string): LiveCard[] {
  return cards.filter((c) => !(c.clientTempId === clientTempId && c.id.startsWith("temp-")));
}

/** Вернуть прежнее состояние карточки после ошибки (удаление/смена статуса). */
export function restoreCard(cards: LiveCard[], previous: LiveCard): LiveCard[] {
  return upsertCard(cards, previous);
}

/** Только http/https; иначе null. */
export function safeLink(raw: string): { url: string; domain: string } | null {
  const value = raw.trim();
  if (!value || value.length > MAX_CARD_TEXT) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return { url: parsed.toString(), domain: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** Последние карточки для стола и сколько осталось сверх них. */
export function tableCards(cards: LiveCard[], limit = TABLE_CARDS) {
  const shown = cards.slice(-limit);
  return { shown, more: cards.length - shown.length };
}

/** Удалить/отметить может автор или начавший эфир. */
export function canManageCard(userId: string | null, card: LiveCard, startedBy: string | null | undefined) {
  return Boolean(userId && (userId === card.authorId || userId === startedBy));
}
