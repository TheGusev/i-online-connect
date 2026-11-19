import type { BoardPost } from './types';

/** Через сколько карточка уходит с поля на полку, если места хватает. */
export const FIELD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_PINNED_ON_FIELD = 2;
export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 8;
const DEFAULT_CAPACITY = 4;

/** Сколько плиток помещается на поле: две колонки, число строк берётся из высоты. */
export function fieldCapacity(heightPx: number, tilePx = 80, gapPx = 8, columns = 2): number {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return DEFAULT_CAPACITY;
  const rows = Math.floor((heightPx + gapPx) / (tilePx + gapPx));
  return Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, rows * columns));
}

/**
 * Поле всегда остаётся чистым: на нём только свежее и закреплённое, и не больше,
 * чем помещается на экране. Когда новостей много, старые уходят на полку раньше суток.
 */
export function splitBoard(
  posts: BoardPost[],
  nowMs: number,
  capacity: number,
  maxAgeMs = FIELD_MAX_AGE_MS,
): { field: BoardPost[]; shelf: BoardPost[] } {
  const newestFirst = [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const pinned = newestFirst.filter((post) => post.pinned).slice(0, MAX_PINNED_ON_FIELD);
  const fresh = newestFirst.filter((post) => !post.pinned && nowMs - Date.parse(post.createdAt) < maxAgeMs);
  const slots = Math.max(0, capacity - pinned.length);
  const field = [...pinned, ...fresh.slice(0, slots)];
  const onField = new Set(field.map((post) => post.id));
  return { field, shelf: newestFirst.filter((post) => !onField.has(post.id)) };
}
