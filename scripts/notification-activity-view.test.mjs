import assert from "node:assert/strict";
import test from "node:test";

import { readActivityStars } from "../src/features/notifications/activity-view.ts";

const snapshot = (minutes, stars) => ({
  version: 1,
  stars,
  activeMinutes: minutes,
  windowSeconds: 3600,
  calculatedAt: new Date(0).toISOString(),
});

for (const [minutes, stars] of [
  [0, 1], [2, 1], [3, 2], [6, 2],
  [7, 3], [11, 3], [12, 4], [19, 4],
  [20, 5], [60, 5], [61, 5],
]) {
  test(`valid snapshot: ${minutes} minutes, ${stars} stars`, () => {
    assert.equal(readActivityStars(snapshot(minutes, stars)), stars);
  });
}

test("old notification without a snapshot has unknown activity", () => {
  for (const value of [undefined, null, {}, [], "5", 5]) {
    assert.equal(readActivityStars(value), null);
  }
});

test("event importance is not an activity level", () => {
  assert.equal(readActivityStars({ stars: 3 }), null);
});

test("inconsistent and invalid snapshots are rejected", () => {
  for (const value of [
    snapshot(0, 5),
    snapshot(20, 1),
    snapshot(-1, 1),
    snapshot(62, 5),
    snapshot(3.5, 2),
    snapshot(20, "5"),
    { ...snapshot(20, 5), version: 2 },
    { ...snapshot(20, 5), windowSeconds: 60 },
    { ...snapshot(20, 5), calculatedAt: "invalid" },
  ]) {
    assert.equal(readActivityStars(value), null);
  }
});
