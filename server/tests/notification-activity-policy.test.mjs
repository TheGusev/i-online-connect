import assert from "node:assert/strict";
import test from "node:test";

import { starsForActiveMinutes } from "../src/notifications/activity-policy.ts";

for (const [minutes, stars] of [
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 2],
  [6, 2],
  [7, 3],
  [11, 3],
  [12, 4],
  [19, 4],
  [20, 5],
  [60, 5],
  [61, 5],
]) {
  test(`${minutes} active minutes -> ${stars} stars`, () => {
    assert.equal(starsForActiveMinutes(minutes), stars);
  });
}

test("invalid values are rejected", () => {
  for (const value of [-1, 0.5, 62, NaN, Infinity, "20", null, undefined]) {
    assert.throws(() => starsForActiveMinutes(value), RangeError);
  }
});

test("level falls when the number of recent active minutes falls", () => {
  assert.deepEqual(
    [20, 19, 11, 6, 2, 0].map(starsForActiveMinutes),
    [5, 4, 3, 2, 1, 1],
  );
});
