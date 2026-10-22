import { cn } from "@/lib/utils";
import { liveEmojiClass, liveEmojiDelay } from "@/features/chat/live-emoji";

/**
 * Живой эмодзи: inline-block span с мягкой бесконечной анимацией по символу.
 * Обычные эмодзи рендерятся как есть. Задержка от хеша seed — соседние чипы
 * не двигаются синхронно.
 */
export function LiveEmoji({
  symbol,
  seed,
  className,
}: {
  symbol: string;
  /** Уникальный ключ элемента (например, id сообщения или индекс) для разной фазы. */
  seed?: string | number;
  className?: string;
}) {
  const animation = liveEmojiClass(symbol);
  if (!animation) return <span className={className}>{symbol}</span>;
  return (
    <span
      className={cn("live-emoji", animation, className)}
      style={{ animationDelay: `${liveEmojiDelay(`${symbol}:${seed ?? ""}`)}s` }}
    >
      {symbol}
    </span>
  );
}
