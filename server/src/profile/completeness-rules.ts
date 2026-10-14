/**
 * «Анкета заполнена» — все обязательные поля исходного опросника онбординга.
 *
 * Обязательные: имя, возраст, город, цель знакомства, «о себе»,
 * минимум 3 интереса, «что ценю», «что радует», хотя бы одно фото.
 * «Что неприемлемо» — необязательное поле опросника.
 */
export const MIN_INTERESTS = 3;

export interface CompletenessInput {
  name: string | null;
  age: number | null;
  city: string | null;
  intent: string | null;
  bio: string | null;
  interests: number;
  valuesText: string | null;
  joyText: string | null;
  photos: number;
}

export interface Completeness {
  complete: boolean;
  filled: number;
  total: number;
  missing: string[];
}

const filled = (value: string | null) => Boolean(value && value.trim().length > 0);

export function evaluateCompleteness(input: CompletenessInput): Completeness {
  const checks: Array<[string, boolean]> = [
    ["name", filled(input.name)],
    ["age", typeof input.age === "number" && input.age >= 18],
    ["city", filled(input.city)],
    ["intent", Boolean(input.intent) && input.intent !== "unsure"],
    ["bio", filled(input.bio)],
    ["interests", input.interests >= MIN_INTERESTS],
    ["valuesText", filled(input.valuesText)],
    ["joyText", filled(input.joyText)],
    ["photo", input.photos > 0],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([key]) => key);
  return {
    complete: missing.length === 0,
    filled: checks.length - missing.length,
    total: checks.length,
    missing,
  };
}

/** Решение по категории «Знакомства» для запроса списка. */
export function datingAccess(
  category: string | undefined,
  complete: boolean,
): "forbidden" | "exclude" | "include" {
  if (category === "dating") return complete ? "include" : "forbidden";
  if (category) return "include";
  return complete ? "include" : "exclude";
}
