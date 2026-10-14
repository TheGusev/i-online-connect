/** Empty age remains optional; keep the existing age limits when supplied. */
export function parseProfileAge(value: string): { valid: boolean; age: number | null } {
  if (!value.trim()) return { valid: true, age: null };
  const age = Number.parseInt(value, 10);
  return { valid: Number.isFinite(age) && age >= 18 && age <= 120, age };
}