/** Пользователь у низа ленты (в пределах threshold px) — можно автопрокручивать. */
export function isNearBottom(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 120) {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}
