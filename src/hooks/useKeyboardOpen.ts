import { useEffect, useState } from "react";

/**
 * Открыта ли экранная клавиатура. Считаем по visualViewport: когда его высота
 * заметно меньше высоты окна — клавиатура перекрывает экран. Нужно, чтобы
 * нижняя навигация не «уезжала» вверх вместе с клавиатурой.
 */
export function useKeyboardOpen(threshold = 140): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => setOpen(window.innerHeight - viewport.height > threshold);
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [threshold]);

  return open;
}
