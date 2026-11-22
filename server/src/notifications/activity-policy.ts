export type ActivityStars = 1 | 2 | 3 | 4 | 5;

export interface ActorActivitySnapshot {
  version: 1;
  stars: ActivityStars;
  activeMinutes: number;
  windowSeconds: 3600;
  calculatedAt: string;
}

/**
 * В скользящем окне 60 минут могут пересекаться
 * части 61 календарной минуты.
 */
export function starsForActiveMinutes(minutes: number): ActivityStars {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 61) {
    throw new RangeError("activeMinutes must be an integer between 0 and 61");
  }

  if (minutes >= 20) return 5;
  if (minutes >= 12) return 4;
  if (minutes >= 7) return 3;
  if (minutes >= 3) return 2;
  return 1;
}
