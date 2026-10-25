import assert from "node:assert/strict";
import { test } from "node:test";
import { priceAt, URGENT_DURATIONS } from "./urgent";
import { priceAt as serverPriceAt } from "../../../server/src/listings/urgent";
import { clockLeft, moneyInput, priceSteps, sellFormError, unreservedUrgent, urgentListings } from "./urgent-ui";

test("browser price equals server for every duration and time boundary", () => {
  for (const minutes of URGENT_DURATIONS.sell.options) {
    for (const steps of [3, 4, 5, 6, 8, 9, 10]) {
      for (const fraction of [0, .1, .5, .84999, .85, .99, 1]) {
        const input = { start: 15_000_000, floor: 10_000_000, createdAt: 0, expiresAt: minutes * 60000, steps };
        assert.deepEqual(priceAt(input, input.expiresAt * fraction), serverPriceAt(input, input.expiresAt * fraction));
      }
    }
  }
});
test("sell requires at least two photos", () => {
  assert.notEqual(sellFormError(15000, 10000, 1), null);
  assert.equal(sellFormError(15000, 10000, 2), null);
});
test("minimum 100 rubles and start at most 1.5 times floor", () => {
  assert.notEqual(sellFormError(15000, 9999, 2), null);
  assert.notEqual(sellFormError(15001, 10000, 2), null);
  assert.equal(sellFormError(15000, 10000, 2), null);
});
test("relist start cannot exceed previous start", () => {
  assert.notEqual(sellFormError(15000, 10000, 2, 14000), null);
  assert.equal(sellFormError(14000, 10000, 2, 14000), null);
});
test("urgent list excludes holds and sorts by soonest expiry", () => {
  const a = { state: "active" as const, expiresAt: new Date(5000).toISOString() };
  const b = { state: "active" as const, expiresAt: new Date(3000).toISOString() };
  const held = { ...b, reservation: { active: true, mine: false, expiresAt: null, priceMinor: null, source: null } };
  assert.deepEqual(unreservedUrgent([a, held, b, { ...a, state: "closed" as const }], 1000), [b, a]);
});
test("six-hour seller preview has 8 drops and final floor at 85 percent", () => {
  const steps = priceSteps(15000, 10000, 360);
  assert.equal(steps.length, 8);
  assert.equal(steps[7]?.afterMinutes, 306);
  assert.equal(steps[7]?.priceMinor, 10000);
});
test("urgent-only filter excludes other listing categories", () => {
  const urgent = { category: "urgent" as const, state: "active" as const, expiresAt: new Date(5000).toISOString() };
  const ordinary = { ...urgent, category: "service" as const };
  assert.deepEqual(urgentListings([ordinary, urgent], 1000), [urgent]);
});
test("urgent-only filter orders by remaining time, soonest first", () => {
  const later = { category: "urgent" as const, state: "active" as const, expiresAt: new Date(61000).toISOString() };
  const sooner = { ...later, expiresAt: new Date(31000).toISOString() };
  assert.deepEqual(urgentListings([later, sooner], 1000), [sooner, later]);
});
test("currency input rejects invalid values and supports decimal comma", () => {
  assert.equal(moneyInput("100,50"), 10050);
  assert.equal(moneyInput("abc"), null);
  assert.equal(moneyInput(""), null);
  assert.equal(moneyInput("-1"), null);
});
test("countdown updates across seconds and never negative", () => {
  assert.equal(clockLeft(new Date(90000).toISOString(), 0), "01:30");
  assert.equal(clockLeft(new Date(90000).toISOString(), 1000), "01:29");
  assert.equal(clockLeft(new Date(90000).toISOString(), 91000), "00:00");
});