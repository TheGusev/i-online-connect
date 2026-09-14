import { useSyncExternalStore } from "react";

/**
 * ЕДИНСТВЕННОЕ место в приложении, которое читает `visualViewport`.
 *
 * `window.innerHeight` при открытой клавиатуре на iOS не меняется, поэтому
 * вёрстка на 100vh/100dvh «растягивается» и уезжает вверх. Реальную видимую
 * высоту даёт только `visualViewport`. Пишем её в CSS-переменные на корне
 * документа, а все экраны и оверлеи используют переменные:
 *
 *   --vvh          видимая высота (вместо 100dvh)
 *   --vv-top       смещение видимой области сверху (visualViewport.offsetTop)
 *   --vv-keyboard  высота клавиатуры (0, когда она закрыта)
 *
 * Никаких дублирующих подписок в компонентах: только этот хук.
 */
function readViewport() {
  const viewport = window.visualViewport;
  const innerHeight = window.innerHeight;
  if (!viewport) return { height: innerHeight, inset: 0, top: 0 };
  const overlap = innerHeight - viewport.height - viewport.offsetTop;
  return {
    height: Math.round(viewport.height),
    // Меньше 80px — это адресная строка браузера, а не клавиатура.
    inset: overlap > 80 ? Math.round(overlap) : 0,
    top: Math.round(viewport.offsetTop),
  };
}

let viewportInset = 0;
let viewportHeight = 0;
let listening = false;
const listeners = new Set<() => void>();

function updateViewport() {
  const { height, inset, top } = readViewport();
  const root = document.documentElement;
  root.style.setProperty("--vvh", `${height}px`);
  root.style.setProperty("--vv-top", `${top}px`);
  root.style.setProperty("--vv-keyboard", `${inset}px`);
  viewportHeight = height;
  if (viewportInset !== inset) {
    viewportInset = inset;
    listeners.forEach((listener) => listener());
  }
}

/**
 * Подписка ставится один раз за жизнь страницы и не снимается: переменные
 * должны быть верными и на экранах, которые сам хук не вызывают.
 */
function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  updateViewport();
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("scroll", updateViewport);
  window.addEventListener("resize", updateViewport);
  window.addEventListener("orientationchange", updateViewport);
  // Поворот экрана: Safari сообщает новые размеры с задержкой.
  window.addEventListener("orientationchange", () => {
    setTimeout(updateViewport, 250);
  });
  window.addEventListener("focusin", updateViewport);
  window.addEventListener("focusout", updateViewport);
}

if (typeof window !== "undefined") startListening();

function subscribe(listener: () => void) {
  listeners.add(listener);
  startListening();
  return () => {
    listeners.delete(listener);
  };
}

/** Высота клавиатуры в пикселях (0 — закрыта). */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, () => viewportInset, () => 0);
}

/** Открыта ли клавиатура — для скрытия нижней навигации. */
export function useKeyboardOpen(): boolean {
  return useKeyboardInset() > 0;
}

/** Видимая высота и высота клавиатуры одним объектом. */
export function useViewportHeight(): { height: number; keyboardInset: number } {
  const keyboardInset = useKeyboardInset();
  return { height: viewportHeight, keyboardInset };
}

/**
 * Держит CSS-переменные актуальными на всех экранах, даже если конкретной
 * странице сами значения не нужны. Вызывается один раз в каркасе приложения.
 */
export function useViewportHeightVar(): void {
  useKeyboardInset();
}
