import assert from "node:assert/strict";
import { test } from "node:test";

import { initialCategory, selectCategory } from "./category-selection";

test("no category filter by default", () => {
  assert.equal(initialCategory, null);
});

test("click selects the requested category", () => {
  assert.equal(selectCategory(null, "dating"), "dating");
  assert.equal(selectCategory("dating", "service"), "service");
});

test("repeat click clears the category filter", () => {
  assert.equal(selectCategory("dating", "dating"), null);
});

test("required selection in listing creation cannot be cleared", () => {
  assert.equal(selectCategory("service", "service", false), "service");
});