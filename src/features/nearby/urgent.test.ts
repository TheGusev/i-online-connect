import assert from "node:assert/strict";
import { test } from "node:test";
import { floorHintPct, priceAt, suggestPrices } from "./urgent";

test("urgent buyer hint hides the exact floor behind tens of percent", () => {
  assert.equal(floorHintPct(15000, 10000), 60);
});

test("seller suggestions use 75% and 55% of market", () => {
  assert.deepEqual(suggestPrices(100000), { start: 75000, floor: 55000 });
});

test("urgent price stays at floor during final 15 percent", () => {
  const lot = { start: 15000, floor: 10000, createdAt: 0, expiresAt: 3600000, steps: 5 };
  assert.equal(priceAt(lot, 3060000).priceMinor, 10000);
  assert.equal(priceAt(lot, 3060000).nextDropAt, null);
});