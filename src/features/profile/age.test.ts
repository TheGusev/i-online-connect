import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProfileAge } from "./age";

test("empty age does not block saving a phone user's profile", () => {
  assert.deepEqual(parseProfileAge(""), { valid: true, age: null });
  assert.deepEqual(parseProfileAge("  "), { valid: true, age: null });
});
test("provided age uses the 18 to 100 limits", () => {
  assert.deepEqual(parseProfileAge("18"), { valid: true, age: 18 });
  assert.deepEqual(parseProfileAge("100"), { valid: true, age: 100 });
  assert.equal(parseProfileAge("17").valid, false);
  assert.equal(parseProfileAge("101").valid, false);
  assert.equal(parseProfileAge("18abc").valid, false);
  assert.equal(parseProfileAge("abc").valid, false);
});