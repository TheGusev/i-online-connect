/**
 * Допустимые сроки актуальности объявлений по категориям (в минутах).
 * Копия: src/features/nearby/durations.ts — совпадение проверяет тест durations.test.mjs.
 */
const H = 60;
const D = 1440;

export type DurationCategory =
  | "urgent" | "travel" | "leisure" | "help" | "sale" | "service" | "transport" | "realty" | "dating";

export const LISTING_DURATIONS: Record<DurationCategory, { options: number[]; default: number }> = {
  urgent: { options: [15, 30, H, 3 * H, 6 * H, D], default: H },
  travel: { options: [3 * H, 12 * H, D, 3 * D, 7 * D], default: D },
  leisure: { options: [3 * H, D, 3 * D, 7 * D, 14 * D], default: 3 * D },
  help: { options: [D, 3 * D, 7 * D, 14 * D], default: 3 * D },
  sale: { options: [3 * D, 7 * D, 14 * D, 30 * D], default: 14 * D },
  service: { options: [7 * D, 14 * D, 30 * D, 60 * D], default: 30 * D },
  transport: { options: [14 * D, 30 * D, 60 * D], default: 30 * D },
  realty: { options: [14 * D, 30 * D, 60 * D, 90 * D], default: 30 * D },
  dating: { options: [7 * D, 14 * D, 30 * D], default: 14 * D },
};

export function durationAllowed(category: string, minutes: number): boolean {
  const entry = LISTING_DURATIONS[category as DurationCategory];
  return Boolean(entry && entry.options.includes(minutes));
}

/** Срок из запроса: минуты, дни (устаревшее поле) или значение категории по умолчанию. */
export function resolveDuration(
  category: string,
  input: { expiresInMinutes?: number | undefined; expiresInDays?: number | undefined },
): number | null {
  const entry = LISTING_DURATIONS[category as DurationCategory];
  if (!entry) return null;
  const minutes =
    input.expiresInMinutes ?? (input.expiresInDays !== undefined ? input.expiresInDays * D : entry.default);
  return entry.options.includes(minutes) ? minutes : null;
}
