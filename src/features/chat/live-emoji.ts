/** Живые эмодзи: какой символ какой анимацией движется. Остальные не анимируются. */

const LIVE_EMOJI: Record<string, string> = {
  "🔥": "live-emoji--fire",
  "❤️": "live-emoji--heart",
  "😂": "live-emoji--laugh",
  "👍": "live-emoji--thumb",
  "😮": "live-emoji--wow",
  "😢": "live-emoji--cry",
};

/** Класс анимации для символа или null, если эмодзи обычный. */
export function liveEmojiClass(symbol: string): string | null {
  return LIVE_EMOJI[symbol] ?? null;
}

/**
 * Отрицательная задержка от хеша: одинаковые эмодзи в разных чипах
 * начинают с разной фазы и не двигаются синхронно. Диапазон (-1.6с, 0].
 */
export function liveEmojiDelay(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return -((hash % 1600) / 1000);
}
