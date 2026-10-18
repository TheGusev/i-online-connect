/**
 * Чистые правила жестов «свайп между вкладками» и «назад от края».
 * Вынесены отдельно, чтобы их можно было проверить тестами без браузера.
 */

export const SWIPE_LOCK_DISTANCE = 10;
export const SWIPE_AXIS_RATIO = 1.5;
export const SWIPE_COMMIT_SHARE = 0.25;
export const SWIPE_COMMIT_VELOCITY = 0.4; // пикс/мс
export const EDGE_BACK_ZONE = 24;
export const EDGE_RESISTANCE = 3;

export type SwipeDecision = "pending" | "horizontal" | "vertical";

/** Решаем, чей это жест: после ~10px горизонталь должна преобладать в 1,5 раза. */
export function classifySwipe(dx: number, dy: number): SwipeDecision {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_LOCK_DISTANCE) return "pending";
  return ax > ay * SWIPE_AXIS_RATIO ? "horizontal" : "vertical";
}

/** Отпускание пальца: доезжаем при 25% ширины или быстром броске, иначе возврат. */
export function shouldCommit(dx: number, width: number, velocity: number): boolean {
  if (width <= 0) return false;
  if (Math.abs(dx) >= width * SWIPE_COMMIT_SHARE) return true;
  return Math.abs(velocity) > SWIPE_COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(dx);
}

/** Упругое сопротивление, когда соседней вкладки нет. */
export function resist(dx: number, hasNeighbor: boolean): number {
  return hasNeighbor ? dx : dx / EDGE_RESISTANCE;
}

/** Минимальный интерфейс элемента, чтобы правило работало и в тестах. */
export interface SwipeTarget {
  closest(selector: string): unknown;
}

export const NO_SWIPE_SELECTOR = [
  "[data-no-swipe]",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='dialog']",
  "[role='slider']",
  "input[type='range']",
].join(",");

/** Нельзя начинать свайп экранов из лент, галерей, полей ввода и окон. */
export function isBlockedTarget(target: SwipeTarget | null): boolean {
  if (!target) return true;
  return target.closest(NO_SWIPE_SELECTOR) !== null;
}

/** Порядок вкладок по умолчанию: Рядом, Чат, Сообщества, Профиль. Текущий — из tab-order. */
import { DEFAULT_TAB_ORDER } from "./tab-order";
export const TAB_PATHS = DEFAULT_TAB_ORDER;

const normalize = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

export function tabIndexOf(pathname: string, order: readonly string[] = TAB_PATHS): number {
  return order.indexOf(normalize(pathname));
}
