/** Режимы эфира. Хранятся в live_sessions.mode (колонка уже есть, миграция 029). */

export const LIVE_MODES = ["talk", "work", "learn", "family", "cinema"] as const;

export type LiveMode = (typeof LIVE_MODES)[number];

export const DEFAULT_MODE: LiveMode = "talk";

/** Допустимый режим или "talk" для любого прочего значения. */
export function parseMode(value: unknown): LiveMode {
  return typeof value === "string" && (LIVE_MODES as readonly string[]).includes(value)
    ? (value as LiveMode)
    : DEFAULT_MODE;
}
