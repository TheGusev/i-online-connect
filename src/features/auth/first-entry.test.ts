import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsFirstEntry,
  validEntryAge,
  visibleAge,
  noticeDismissed,
  dismissNotice,
  PHONE_LOGIN_ENABLED,
} from "./first-entry";

for (const [value, valid] of [
  ["17", false],
  ["18", true],
  ["100", true],
  ["101", false],
  ["abc", false],
  ["18.5", false],
] as const) {
  test(`entry age ${value}`, () => assert.equal(validEntryAge(value), valid));
}
test("missing and zero age returns to entry, completed age does not", () => {
  assert.equal(needsFirstEntry({ age: 0 }), true);
  assert.equal(needsFirstEntry({}), true);
  assert.equal(needsFirstEntry({ age: 18 }), false);
});
test("zero age is hidden", () => {
  assert.equal(visibleAge(0), "");
  assert.equal(visibleAge(null), "");
  assert.equal(visibleAge(18), ", 18");
});
for (const kind of ["recovery", "verification"] as const) {
  test(`${kind} dismissal is retained per account`, () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    assert.equal(noticeDismissed(storage, "one", kind), false);
    dismissNotice(storage, "one", kind);
    assert.equal(noticeDismissed(storage, "one", kind), true);
    assert.equal(noticeDismissed(storage, "two", kind), false);
  });
}
test("SMS login is disabled by default", () => assert.equal(PHONE_LOGIN_ENABLED, false));
