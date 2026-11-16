export interface VerifiedPlace {
  city: string;
  regionId: string;
  regionalCenter: string;
}

export type CityResolution =
  | { status: 'resolved'; place: VerifiedPlace }
  | { status: 'needs_confirmation'; suggestion: string }
  | { status: 'needs_city' };

export function cityKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

// Directory entries must originate from verified geographic data, not profile text.
// Resolve aliases to suggestions only: never silently change the user's profile.
export function resolveCity(
  input: string | null | undefined,
  directory: readonly VerifiedPlace[],
  aliases: Readonly<Record<string, string>> = {},
): CityResolution {
  const key = cityKey(input ?? '');
  if (!key) return { status: 'needs_city' };
  const matches = directory.filter(place => cityKey(place.city) === key);
  if (matches.length === 1) return { status: 'resolved', place: matches[0]! };
  const suggestion = aliases[key];
  if (matches.length === 0 && suggestion) return { status: 'needs_confirmation', suggestion };
  return { status: 'needs_city' };
}

export interface CommunityCandidate {
  id: string;
  regionId: string;
  isSeed: boolean;
  isPrivate: boolean;
  accessible: boolean;
  joined: boolean;
}

// Preserve accessible memberships; only public regional discovery consumes demo slots.
// Hidden demo records remain in the database, including messages and memberships.
export function selectRegionalCommunities<T extends CommunityCandidate>(
  rows: readonly T[], regionId: string,
): T[] {
  const available = rows.filter(row => row.accessible);
  const real = available.filter(row => !row.isSeed && row.regionId === regionId && !row.isPrivate);
  const seeds = available.filter(row => row.isSeed && row.regionId === regionId && !row.isPrivate)
    .slice().sort((a, b) => a.id.localeCompare(b.id));
  const keep = new Set(seeds.slice(0, Math.max(0, seeds.length - real.length)).map(row => row.id));
  return available.filter(row => row.joined || (!row.isSeed && row.regionId === regionId && !row.isPrivate) || keep.has(row.id));
}

export const COMMUNITY_TOPICS = [
  { key: 'auto', category: 'city', title: 'Авто и гараж', description: 'Обсуждение автомобилей, ухода и ремонта.' },
  { key: 'games', category: 'games', title: 'Настольные игры', description: 'Правила, любимые игры и поиск компании.' },
  { key: 'walks', category: 'city', title: 'Прогулки по городу', description: 'Маршруты и идеи для спокойных прогулок.' },
  { key: 'cinema', category: 'culture', title: 'Кино и обсуждения', description: 'Фильмы, впечатления и разговоры после просмотра.' },
  { key: 'books', category: 'culture', title: 'Книжный клуб', description: 'Любимые книги и совместное чтение.' },
  { key: 'sport', category: 'sport', title: 'Спорт для своих', description: 'Любительские тренировки и поддержка новичков.' },
  { key: 'cycling', category: 'sport', title: 'Велопрогулки', description: 'Велосипеды, снаряжение и маршруты.' },
  { key: 'hiking', category: 'sport', title: 'Походы и природа', description: 'Подготовка к походам и бережное отношение к природе.' },
  { key: 'fishing', category: 'city', title: 'Рыбалка', description: 'Снасти, опыт и обсуждение выездов.' },
  { key: 'food', category: 'food', title: 'Готовим вместе', description: 'Рецепты, кулинарные идеи и домашняя кухня.' },
  { key: 'pets', category: 'city', title: 'Питомцы и прогулки', description: 'Уход за питомцами и общение владельцев.' },
  { key: 'photo', category: 'culture', title: 'Фотопрогулки', description: 'Съёмка, композиция и обмен опытом.' },
  { key: 'projects', category: 'professional', title: 'IT и проекты', description: 'Идеи, технологии и поиск единомышленников.' },
  { key: 'craft', category: 'culture', title: 'Рукоделие и мастерская', description: 'Творчество, материалы и вещи своими руками.' },
] as const;

export function regionalCommunityTemplates(place: VerifiedPlace) {
  return COMMUNITY_TOPICS.map(topic => ({
    ...topic,
    seedKey: `${place.regionId}:${topic.key}`,
    city: place.regionalCenter,
    regionId: place.regionId,
    isSeed: true as const,
    verifiedCommunity: false,
    description: `Демо-пример сообщества. ${topic.description}`,
  }));
}

// Call the persistence adapter in a DB transaction with a region-scoped lock
// and a unique seedKey constraint. Concurrent requests must never create duplicates.
export async function ensureRegionalDemo(
  resolution: CityResolution,
  ensureOnce: (regionId: string, templates: ReturnType<typeof regionalCommunityTemplates>) => Promise<void>,
): Promise<boolean> {
  if (resolution.status !== 'resolved') return false;
  await ensureOnce(resolution.place.regionId, regionalCommunityTemplates(resolution.place));
  return true;
}
