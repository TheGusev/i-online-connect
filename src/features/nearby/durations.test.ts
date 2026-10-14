import assert from "node:assert/strict";
import { test } from "node:test";

import { LISTING_DURATIONS, durationForCategory, durationLabel } from "./durations";

test("every category default is one of its own options", () => {
  for (const [category, entry] of Object.entries(LISTING_DURATIONS)) {
    assert.ok(entry.options.includes(entry.default), category);
  }
});

test("defaults match the brief", () => {
  assert.equal(LISTING_DURATIONS.urgent.default, 60);
  assert.equal(LISTING_DURATIONS.travel.default, 1440);
  assert.equal(LISTING_DURATIONS.sale.default, 14 * 1440);
  assert.equal(LISTING_DURATIONS.dating.default, 14 * 1440);
});

test("allowed chosen duration survives category change", () => {
  assert.equal(durationForCategory("leisure", 1440), 1440);
});

test("disallowed duration falls back to category default", () => {
  assert.equal(durationForCategory("realty", 60), 30 * 1440);
  assert.equal(durationForCategory("urgent", null), 60);
});

test("labels", () => {
  assert.equal(durationLabel(15), "15 мин");
  assert.equal(durationLabel(180), "3 ч");
  assert.equal(durationLabel(3 * 1440), "3 дня");
  assert.equal(durationLabel(30 * 1440), "30 дней");
});
