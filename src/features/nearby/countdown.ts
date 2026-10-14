/**
 * Остаток времени объявления. Считается строго от expiresAt каждого объявления.
 *
 *  больше суток  → «N дн ЧЧ ч»
 *  меньше суток  → «ЧЧ:ММ»
 *  меньше часа   → «ММ:СС»
 */
export type RemainingKind = "days" | "hours" | "minutes" | "expired";

export interface Remaining {
  kind: RemainingKind;
  ms: number;
  /** Две части для «часов» с двоеточием либо готовая строка для дней. */
  left: string;
  right: string;
  text: string;
}

const pad = (value: number) => String(value).padStart(2, "0");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRemaining(expiresAt: string, now: number): Remaining {
  const ms = Math.max(0, Date.parse(expiresAt) - now);
  if (!Number.isFinite(ms) || ms <= 0) {
    return { kind: "expired", ms: 0, left: "", right: "", text: "Истекло" };
  }
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const text = `${days} дн ${pad(hours)} ч`;
    return { kind: "days", ms, left: `${days} дн`, right: `${pad(hours)} ч`, text };
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return { kind: "hours", ms, left: pad(hours), right: pad(minutes), text: `${pad(hours)}:${pad(minutes)}` };
  }
  const minutes = Math.floor(ms / MINUTE);
  const seconds = Math.floor((ms % MINUTE) / 1000);
  return { kind: "minutes", ms, left: pad(minutes), right: pad(seconds), text: `${pad(minutes)}:${pad(seconds)}` };
}
