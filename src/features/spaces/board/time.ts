/** Короткая подпись возраста карточки: «сейчас», «5 мин», «3 ч», «2 дн». */
export function agoLabel(createdAt: string, nowMs: number): string {
  const diff = nowMs - Date.parse(createdAt);
  if (!Number.isFinite(diff) || diff < 60_000) return 'сейчас';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

export function firstName(name: string): string {
  return name.trim().split(' ')[0] ?? name;
}
