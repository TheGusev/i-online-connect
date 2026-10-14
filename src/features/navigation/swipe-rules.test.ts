import { test } from "node:test";
import assert from "node:assert/strict";

import { classifySwipe, isBlockedTarget, resist, shouldCommit, tabIndexOf } from "./swipe-rules";

/** Имитация DOM-узла: closest совпадает, если узел лежит внутри одного из «предков». */
const node = (ancestors: string[]) => ({
  closest: (selector: string) =>
    selector.split(",").some((part) => ancestors.includes(part.trim())) ? {} : null,
});

test("свайп не начинается внутри data-no-swipe", () => {
  assert.equal(isBlockedTarget(node(["[data-no-swipe]"])), true);
});
test("свайп не начинается в поле ввода и в открытом окне", () => {
  assert.equal(isBlockedTarget(node(["input"])), true);
  assert.equal(isBlockedTarget(node(["textarea"])), true);
  assert.equal(isBlockedTarget(node(["[role='dialog']"])), true);
});
test("обычный экран свайп разрешает", () => {
  assert.equal(isBlockedTarget(node([])), false);
});
test("горизонталь только при перевесе в 1,5 раза после 10px", () => {
  assert.equal(classifySwipe(6, 1), "pending");
  assert.equal(classifySwipe(30, 10), "horizontal");
  assert.equal(classifySwipe(30, 25), "vertical");
});
test("доезжает от 25% ширины или скорости больше 0,4", () => {
  assert.equal(shouldCommit(100, 400, 0), true);
  assert.equal(shouldCommit(60, 400, 0.1), false);
  assert.equal(shouldCommit(60, 400, 0.5), true);
});
test("на крайней вкладке сопротивление", () => {
  assert.equal(resist(90, false), 30);
  assert.equal(resist(90, true), 90);
});
test("порядок вкладок", () => {
  assert.equal(tabIndexOf("/chat"), 0);
  assert.equal(tabIndexOf("/nearby/"), 1);
  assert.equal(tabIndexOf("/profile/me"), 3);
  assert.equal(tabIndexOf("/chat/123"), -1);
});
