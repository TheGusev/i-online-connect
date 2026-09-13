import { useSyncExternalStore } from "react";

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
let listening = false;
const listeners = new Set<() => void>();

function updateViewport() {
  const { height, inset, top } = readViewport();
  const root = document.documentElement;
  root.style.setProperty("--app-height", `${height}px`);
  root.style.setProperty("--keyboard-inset", `${inset}px`);
  root.style.setProperty("--viewport-top", `${top}px`);
  if (viewportInset !== inset) {
    viewportInset = inset;
    listeners.forEach((listener) => listener());
  }
}

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  updateViewport();
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("scroll", updateViewport);
  window.addEventListener("resize", updateViewport);
  window.addEventListener("orientationchange", updateViewport);
}

function stopListening() {
  if (!listening || typeof window === "undefined") return;
  listening = false;
  window.visualViewport?.removeEventListener("resize", updateViewport);
  window.visualViewport?.removeEventListener("scroll", updateViewport);
  window.removeEventListener("resize", updateViewport);
  window.removeEventListener("orientationchange", updateViewport);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startListening();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopListening();
  };
}

/** Все потребители делят одну подписку visualViewport, без дублирования обработчиков. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, () => viewportInset, () => 0);
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
