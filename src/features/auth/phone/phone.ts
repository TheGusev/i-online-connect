/** Номер из любого ввода → +7XXXXXXXXXX или null (повторяет серверную нормализацию для +7). */
export function normalizeRuPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `+7${digits}`;
}

/** Десять цифр после +7 из любого ввода (вставка «8 999…», «+7 (999)…»). */
export function nationalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && (digits.startsWith("8") || digits.startsWith("7"))) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** «9991234567» → «999 123-45-67». */
export function formatNational(digits: string): string {
  const d = digits.slice(0, 10);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  let out = parts[0] ?? "";
  if (parts[1]) out += ` ${parts[1]}`;
  if (parts[2]) out += `-${parts[2]}`;
  if (parts[3]) out += `-${parts[3]}`;
  return out;
}
