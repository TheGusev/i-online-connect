import type { Space } from "@/api";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

/** Сначала сообщества с наибольшим числом совпавших интересов пользователя. */
export function sortSpacesByInterests(spaces: Space[], userInterests: string[]) {
  const mine = new Set(userInterests.map(normalize));
  const matches = (space: Space) =>
    space.interests.reduce((count, interest) => count + Number(mine.has(normalize(interest))), 0);

  return [...spaces].sort(
    (a, b) => matches(b) - matches(a) || b.membersCount - a.membersCount || a.title.localeCompare(b.title, "ru"),
  );
}