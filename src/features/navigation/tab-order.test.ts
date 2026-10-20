import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TAB_ORDER,
  isValidOrder,
  loadTabOrder,
  reorderByOffset,
  saveTabOrder,
  tabIndexInOrder,
} from "./tab-order";

const fakeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

test("порядок по умолчанию: Рядом, Чат, Сообщества, Профиль", () => {
  assert.deepEqual([...DEFAULT_TAB_ORDER], ["/nearby", "/chat", "/spaces", "/profile/me"]);
  assert.deepEqual(loadTabOrder(fakeStorage()), [...DEFAULT_TAB_ORDER]);
  assert.deepEqual(loadTabOrder(null), [...DEFAULT_TAB_ORDER]);
});

test("битое или чужое значение в хранилище игнорируется", () => {
  assert.equal(isValidOrder(["/chat", "/chat", "/spaces", "/profile/me"]), false);
  assert.equal(isValidOrder(["/nearby", "/chat", "/spaces"]), false);
  assert.equal(isValidOrder("nope"), false);
  assert.deepEqual(
    loadTabOrder(fakeStorage({ "tab-order:v1": JSON.stringify(["/chat", "/nearby", "/spaces", "/profile/me"]) })),
    ["/chat", "/nearby", "/spaces", "/profile/me"],
  );
  assert.deepEqual(loadTabOrder(fakeStorage({ "tab-order:v1": "{битый json" })), [...DEFAULT_TAB_ORDER]);
});

test("сохранение и чтение порядка", () => {
  const storage = fakeStorage();
  saveTabOrder(storage, ["/profile/me", "/spaces", "/chat", "/nearby"]);
  assert.deepEqual(loadTabOrder(storage), ["/profile/me", "/spaces", "/chat", "/nearby"]);
});

test("перетаскивание сдвигает вкладку на соседние позиции и упирается в края", () => {
  const order: (typeof DEFAULT_TAB_ORDER)[number][] = [...DEFAULT_TAB_ORDER];
  assert.deepEqual(reorderByOffset(order, 1, 1), ["/nearby", "/spaces", "/chat", "/profile/me"]);
  assert.deepEqual(reorderByOffset(order, 1, -1), ["/chat", "/nearby", "/spaces", "/profile/me"]);
  assert.deepEqual(reorderByOffset(order, 0, -3), order);
  assert.deepEqual(reorderByOffset(order, 3, 5), order);
});

test("индекс вкладки ищется в текущем порядке, вложенные экраны не считаются", () => {
  const custom = ["/spaces", "/chat", "/nearby", "/profile/me"];
  assert.equal(tabIndexInOrder(custom, "/chat"), 1);
  assert.equal(tabIndexInOrder(custom, "/nearby/"), 2);
  assert.equal(tabIndexInOrder(custom, "/chat/123"), -1);
});

import { indexFromX, moveItem } from "./tab-order";

test("indexFromX maps finger x to slot and clamps to edges", () => {
  assert.equal(indexFromX(10, 0, 400, 4), 0);
  assert.equal(indexFromX(150, 0, 400, 4), 1);
  assert.equal(indexFromX(399, 0, 400, 4), 3);
  assert.equal(indexFromX(-50, 0, 400, 4), 0);
  assert.equal(indexFromX(900, 0, 400, 4), 3);
  assert.equal(indexFromX(260, 100, 400, 4), 1);
});

test("moveItem moves an item to the target slot", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
});
