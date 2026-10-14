import type { NeedCategory } from "@/api";

/**
 * Допустимые сроки актуальности объявлений по категориям (в минутах).
 * Копия: server/src/listings/durations.ts — совпадение проверяет тест durations.test.mjs.
 */
const H = 60;
const D = 1440;

export const LISTING_DURATIONS: Record<NeedCategory, { options: number[]; default: number }> = {
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

/** Смена категории: допустимый выбранный срок сохраняется, иначе — по умолчанию. */
export function durationForCategory(category: NeedCategory, current: number | null): number {
  const entry = LISTING_DURATIONS[category];
  return current !== null && entry.options.includes(current) ? current : entry.default;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «15 мин», «3 ч», «3 дня», «30 дней». */
export function durationLabel(minutes: number): string {
  if (minutes < H) return `${minutes} мин`;
  if (minutes < D || minutes % D !== 0) return `${Math.round(minutes / H)} ч`;
  const days = minutes / D;
  return `${days} ${plural(days, "день", "дня", "дней")}`;
}

/** «18 окт, 14:30». */
export function expiryLabel(minutes: number, now = new Date()): string {
  const at = new Date(now.getTime() + minutes * 60_000);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(at)
    .replace(".", "");
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(at);
  return `${day}, ${time}`;
}
