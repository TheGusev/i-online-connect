/**
 * Брендированный экран загрузки.
 *
 * Разметка и стили вшиты прямо в документ (см. RootShell в src/routes/__root.tsx),
 * поэтому экран виден мгновенно — до загрузки кода приложения. Здесь только
 * управление его скрытием.
 *
 * Узел не удаляется из DOM: он отрисован React-шеллом, поэтому мы лишь
 * переключаем класс — иначе React мог бы вернуть его обратно.
 */
const SPLASH_ID = "app-splash";
const HIDDEN_CLASS = "is-hidden";

let locked = false;

function element(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(SPLASH_ID);
}

/**
 * Оставить экран загрузки видимым: сейчас пойдёт тихая перезагрузка на новую
 * версию, и мигать пустотой или старым содержимым не нужно.
 */
export function keepSplash() {
  locked = true;
  element()?.classList.remove(HIDDEN_CLASS);
}

/** Приложение готово рисовать содержимое — плавно убираем экран загрузки. */
export function hideSplash() {
  if (locked) return;
  const node = element();
  if (!node || node.classList.contains(HIDDEN_CLASS)) return;
  node.classList.add(HIDDEN_CLASS);
}
