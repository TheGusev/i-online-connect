import { test } from "node:test";
import assert from "node:assert/strict";

import { STACK_MAX, stackTile, stackWidthRem } from "./albums";

test("стопка: средняя плитка крупнее и выше крайних", () => {
  const mid = stackTile(1, 3);
  const edge = stackTile(0, 3);
  assert.equal(mid.scale, 1);
  assert.equal(mid.y, 0);
  assert.ok(edge.scale < mid.scale);
  assert.ok(edge.y > mid.y);
  assert.ok(mid.z > edge.z);
});

test("стопка: ширина ограничена пятью плитками", () => {
  assert.equal(stackWidthRem(9), stackWidthRem(STACK_MAX));
  assert.ok(stackWidthRem(2) < stackWidthRem(3));
});
