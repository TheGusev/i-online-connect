import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { LISTING_DURATIONS, durationAllowed, resolveDuration } from "../src/listings/durations.ts";
import { LISTINGS } from "../scripts/seed-data.mjs";

const block = (path) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  return text.slice(text.indexOf("LISTING_DURATIONS"), text.indexOf("};", text.indexOf("LISTING_DURATIONS")));
};

test("client and server duration configs are identical", () => {
  const strip = (s) => s.replace(/:\s*Record<[^=]+=/, "=");
  assert.equal(strip(block("../src/listings/durations.ts")), strip(block("../../src/features/nearby/durations.ts")));
});

test("each default is among its options", () => {
  for (const entry of Object.values(LISTING_DURATIONS)) assert.ok(entry.options.includes(entry.default));
});

test("server rejects disallowed duration", () => {
  assert.equal(durationAllowed("urgent", 15), true);
  assert.equal(durationAllowed("realty", 15), false);
  assert.equal(resolveDuration("realty", { expiresInMinutes: 60 }), null);
  assert.equal(resolveDuration("sale", { expiresInDays: 7 }), 7 * 1440);
  assert.equal(resolveDuration("service", {}), 30 * 1440);
});

test("seed listings use allowed durations with varied remaining time", () => {
  for (const l of LISTINGS) {
    assert.ok(durationAllowed(l.category, l.expiresMinutes), `${l.category} ${l.expiresMinutes}`);
    assert.ok(l.elapsedMinutes >= 0 && l.elapsedMinutes < l.expiresMinutes);
  }
  assert.ok(new Set(LISTINGS.map((l) => l.expiresMinutes - l.elapsedMinutes)).size > LISTINGS.length / 2);
});
