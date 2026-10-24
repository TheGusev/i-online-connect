/**
 * Режимы эфира: parseMode принимает только известные режимы.
 * Запуск: node --experimental-strip-types --test tests/live-modes.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_MODE, LIVE_MODES, parseMode } from "../src/live/modes.ts";

test("все известные режимы проходят как есть", () => {
  for (const mode of LIVE_MODES) {
    assert.equal(parseMode(mode), mode);
  }
});

test("неизвестные и пустые значения дают talk", () => {
  assert.equal(parseMode("party"), "talk");
  assert.equal(parseMode(""), "talk");
  assert.equal(parseMode("TALK"), "talk");
  assert.equal(parseMode(" talk"), "talk");
  assert.equal(parseMode(null), "talk");
  assert.equal(parseMode(undefined), "talk");
  assert.equal(parseMode(42), "talk");
  assert.equal(parseMode({}), "talk");
});

test("режим по умолчанию — talk", () => {
  assert.equal(DEFAULT_MODE, "talk");
  assert.ok(LIVE_MODES.includes(DEFAULT_MODE));
});
