/** Empty age remains optional; keep the existing age limits when supplied. */
export function parseProfileAge(value: string): { valid: boolean; age: number | null } {
  if (!value.trim()) return { valid: true, age: null };
  const age = Number(value);
  return { valid: Number.isInteger(age) && age >= 18 && age <= 100, age };
}