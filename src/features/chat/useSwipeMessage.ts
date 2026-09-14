import { useCallback, useRef, useState } from "react";

const THRESHOLD = 60;
const MAX_SHIFT = 90;

/**
 * Горизонтальные жесты на пузыре сообщения: вправо — ответить, влево — меню
 * действий. Вертикальная прокрутка истории не перехватывается: пока движение
 * ближе к вертикали, жест отменяется.
 */
export function useSwipeMessage({
  onSwipeRight,
  onSwipeLeft,
  enabled = true,
}: {
  onSwipeRight?: (() => void) | undefined;
  onSwipeLeft?: (() => void) | undefined;
  enabled?: boolean;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);
  const [offset, setOffset] = useState(0);

  const reset = useCallback(() => {
    start.current = null;
    active.current = false;
    setOffset(0);
  }, []);

  const buzz = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  };

  const handlers = enabled
    ? {
        onTouchStart: (event: React.TouchEvent) => {
          const touch = event.touches[0];
          if (!touch) return;
          start.current = { x: touch.clientX, y: touch.clientY };
          active.current = false;
        },
        onTouchMove: (event: React.TouchEvent) => {
          const touch = event.touches[0];
          const from = start.current;
          if (!touch || !from) return;
          const dx = touch.clientX - from.x;
          const dy = touch.clientY - from.y;
          if (!active.current) {
            if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 12) {
              if (Math.abs(dy) > 12) start.current = null;
              return;
            }
            active.current = true;
          }
          const limited = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx));
          setOffset(limited);
        },
        onTouchEnd: () => {
          if (active.current) {
            if (offset >= THRESHOLD && onSwipeRight) {
              buzz();
              onSwipeRight();
            } else if (offset <= -THRESHOLD && onSwipeLeft) {
              buzz();
              onSwipeLeft();
            }
          }
          reset();
        },
        onTouchCancel: reset,
      }
    : {};

  return { offset, swiping: active.current, handlers, threshold: THRESHOLD };
}
