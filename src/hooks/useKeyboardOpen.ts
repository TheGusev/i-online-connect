import { useEffect, useState } from "react";

/**
 * Насколько экранная клавиатура перекрывает окно, в пикселях.
 * Считаем по visualViewport: при `interactive-widget=overlays-content`
 * layout не сжимается, поэтому поле ввода нужно приподнимать самим.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const overlap = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(overlap > 80 ? Math.round(overlap) : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

/** Открыта ли клавиатура — для скрытия нижней навигации. */
export function useKeyboardOpen(): boolean {
  return useKeyboardInset() > 0;
}
