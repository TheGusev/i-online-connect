import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProfileAge } from "./age";

test("empty age does not block saving a phone user's profile", () => {
  assert.deepEqual(parseProfileAge(""), { valid: true, age: null });
  assert.deepEqual(parseProfileAge("  "), { valid: true, age: null });
});
test("provided age keeps the existing 18 to 120 limits", () => {
  assert.deepEqual(parseProfileAge("18"), { valid: true, age: 18 });
  assert.deepEqual(parseProfileAge("120"), { valid: true, age: 120 });
  assert.equal(parseProfileAge("17").valid, false);
  assert.equal(parseProfileAge("121").valid, false);
  assert.equal(parseProfileAge("abc").valid, false);
});