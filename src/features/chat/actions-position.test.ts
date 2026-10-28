import { test } from "node:test";
import assert from "node:assert/strict";
import { computeActionsPosition } from "./actions-position";

const viewport = { top: 0, height: 626, width: 393 };
const position = (rect: { top: number; bottom: number; left: number; right: number }, mine = false, view = viewport) =>
  computeActionsPosition({ rect, viewport: view, panelHeight: 112, mine });
test("bottom message places actions above", () => assert.equal(position({ top: 560, bottom: 610, left: 20, right: 370 }).top, 440));
test("top message places actions below", () => assert.equal(position({ top: 5, bottom: 45, left: 20, right: 370 }).top, 53));
test("keyboard offset is subtracted and panel remains visible", () => {
  assert.equal(position({ top: 350, bottom: 400, left: 20, right: 370 }, true, { top: 100, height: 320, width: 393 }).top, 130);
});
test("right edge clamps to eight pixel margin", () => assert.equal(position({ top: 100, bottom: 150, left: 200, right: 500 }, true).left, 65));
test("left edge clamps to eight pixel margin", () => assert.equal(position({ top: 100, bottom: 150, left: -20, right: 100 }).left, 8));
test("expanded actions fit a short viewport", () => {
  const result = computeActionsPosition({ rect: { top: 400, bottom: 500, left: 0, right: 320 }, viewport: { top: 100, height: 200, width: 320 }, panelHeight: 350, mine: true });
  assert.equal(result.top, 8);
  assert.equal(result.maxHeight, 184);
  assert.equal(result.left, 8);
});