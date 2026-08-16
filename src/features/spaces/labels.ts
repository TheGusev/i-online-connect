import type { SpaceCadence, SpaceCategory, SpaceFormat } from "@/api";

export const categoryLabels: Record<SpaceCategory, string> = {
  sport: "Активность и спорт",
  games: "Игры",
  professional: "Профессия",
  culture: "Культура",
  food: "Еда",
  city: "Город",
};

export const formatLabels: Record<SpaceFormat, string> = {
  offline: "Офлайн",
  online: "Онлайн",
  mixed: "Онлайн и офлайн",
};

export const cadenceLabels: Record<SpaceCadence, string> = {
  weekly: "Каждую неделю",
  biweekly: "Раз в две недели",
  monthly: "Раз в месяц",
  occasional: "Когда собираемся",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEventDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function formatMembers(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} участника`;
  return `${count} участников`;
}
