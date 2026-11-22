export type ActivityStars = 1 | 2 | 3 | 4 | 5;

/** Нет достоверного снимка — нет придуманного уровня. */
export function readActivityStars(value: unknown): ActivityStars | null {
  if (typeof value !== "object" || value === null) return null;

  const data = value as Record<string, unknown>;
  const stars = data["stars"];
  const minutes = data["activeMinutes"];
  const calculatedAt = data["calculatedAt"];

  if (
    data["version"] !== 1 ||
    data["windowSeconds"] !== 3600 ||
    typeof stars !== "number" ||
    !Number.isInteger(stars) ||
    stars < 1 ||
    stars > 5 ||
    typeof minutes !== "number" ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes > 61 ||
    typeof calculatedAt !== "string" ||
    !Number.isFinite(Date.parse(calculatedAt))
  ) return null;

  const expected =
    minutes >= 20 ? 5 :
    minutes >= 12 ? 4 :
    minutes >= 7 ? 3 :
    minutes >= 3 ? 2 : 1;

  return stars === expected ? stars as ActivityStars : null;
}
