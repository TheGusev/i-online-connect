/**
 * Счётчик блокировок прокрутки body. Несколько окон могут открываться
 * одновременно (одно ещё уходит с анимацией — другое уже открылось),
 * поэтому исходное значение overflow возвращается только когда счётчик
 * дойдёт до нуля, а не при закрытии каждого окна по отдельности.
 */
let lockCount = 0;
let previousOverflow: string | null = null;

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && previousOverflow !== null) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = null;
    }
  };
}
