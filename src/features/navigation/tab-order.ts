/**
 * Порядок вкладок нижнего меню. По умолчанию: Рядом, Чат, Сообщества, Профиль.
 * Пользовательский порядок хранится в localStorage с версией ключа.
 * Чистые функции вынесены, чтобы проверить их тестами без браузера.
 */

export const TAB_ORDER_KEY = "tab-order:v1";
export const TAB_ORDER_HINT_KEY = "tab-order-hint:v1";

export const DEFAULT_TAB_ORDER = ["/nearby", "/chat", "/spaces", "/profile/me"] as const;
export type TabPath = (typeof DEFAULT_TAB_ORDER)[number];

/** Проверяет, что сохранённый порядок — ровно тот же набор вкладок. */
export function isValidOrder(value: unknown): value is TabPath[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_TAB_ORDER.length) return false;
  const set = new Set(value);
  return DEFAULT_TAB_ORDER.every((path) => set.has(path));
}

/** Читает порядок из localStorage; при битом значении — порядок по умолчанию. */
export function loadTabOrder(storage: Pick<Storage, "getItem"> | null): TabPath[] {
  if (!storage) return [...DEFAULT_TAB_ORDER];
  try {
    const raw = storage.getItem(TAB_ORDER_KEY);
    if (!raw) return [...DEFAULT_TAB_ORDER];
    const parsed: unknown = JSON.parse(raw);
    return isValidOrder(parsed) ? parsed : [...DEFAULT_TAB_ORDER];
  } catch {
    return [...DEFAULT_TAB_ORDER];
  }
}

export function saveTabOrder(storage: Pick<Storage, "setItem"> | null, order: TabPath[]): void {
  if (!storage) return;
  try {
    storage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Приватный режим и т.п. — просто не сохраняем.
  }
}

/**
 * Перестановка при перетаскивании: dragged смещается на offset ширин вкладки.
 * Возвращает новый порядок (или тот же, если смещение не меняет позицию).
 */
export function reorderByOffset(order: TabPath[], from: number, offsetSlots: number): TabPath[] {
  const to = Math.max(0, Math.min(order.length - 1, from + offsetSlots));
  if (to === from) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Индекс вкладки в текущем порядке по пути экрана; -1 для вложенных экранов. */
export function tabIndexInOrder(order: readonly string[], pathname: string): number {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return order.indexOf(normalized);
}

/** Индекс слота по x пальца относительно списка вкладок (с ограничением краями). */
export function indexFromX(x: number, left: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  const raw = Math.floor(((x - left) / width) * count);
  return Math.max(0, Math.min(count - 1, raw));
}

/** Перемещает элемент from на позицию to. */
export function moveItem<T>(order: T[], from: number, to: number): T[] {
  if (from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
