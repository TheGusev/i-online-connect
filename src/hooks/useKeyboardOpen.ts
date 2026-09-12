import { useEffect, useState } from "react";

/**
 * Мобильная клавиатура и высота экрана.
 *
 * `window.innerHeight` при открытой клавиатуре не меняется, поэтому вёрстка на
 * 100vh/100dvh «растягивается» и уезжает вверх. Единственный надёжный источник
 * реальной видимой высоты — `visualViewport`. Пишем её в CSS-переменные
 * `--app-height` и `--keyboard-inset`, а каркас приложения использует их вместо
 * 100dvh.
 */
function readViewport() {
  const viewport = window.visualViewport;
  const innerHeight = window.innerHeight;
  if (!viewport) return { height: innerHeight, inset: 0 };
  const overlap = innerHeight - viewport.height - viewport.offsetTop;
  return {
    height: Math.round(viewport.height),
    // Меньше 80px — это адресная строка браузера, а не клавиатура.
    inset: overlap > 80 ? Math.round(overlap) : 0,
  };
}

/** Единственный подписчик на visualViewport: держит CSS-переменные и inset. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const { height, inset: next } = readViewport();
      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--keyboard-inset", `${next}px`);
      setInset((prev) => (prev === next ? prev : next));
    };

    update();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return inset;
}

/** Открыта ли клавиатура — для скрытия нижней навигации. */
export function useKeyboardOpen(): boolean {
  return useKeyboardInset() > 0;
}

/**
 * Держит `--app-height` актуальной на всех экранах, даже если конкретной
 * странице сам inset не нужен. Вызывается один раз в каркасе приложения.
 */
export function useViewportHeightVar(): void {
  useKeyboardInset();
}
