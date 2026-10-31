import { test, expect } from "bun:test";
import { needsFirstEntry, validEntryAge, visibleAge, noticeDismissed, dismissNotice, PHONE_LOGIN_ENABLED } from "./first-entry";

for (const [value, valid] of [["17", false], ["18", true], ["100", true], ["101", false], ["abc", false], ["18.5", false]] as const) {
  test(`entry age ${value}`, () => expect(validEntryAge(value)).toBe(valid));
}
test("missing and zero age returns to entry, completed age does not", () => {
  expect(needsFirstEntry({ age: 0 })).toBe(true);
  expect(needsFirstEntry({})).toBe(true);
  expect(needsFirstEntry({ age: 18 })).toBe(false);
});
test("zero age is hidden", () => {
  expect(visibleAge(0)).toBe("");
  expect(visibleAge(null)).toBe("");
  expect(visibleAge(18)).toBe(", 18");
});
for (const kind of ["recovery", "verification"] as const) {
  test(`${kind} dismissal is retained per account`, () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(noticeDismissed(storage, "one", kind)).toBe(false);
    dismissNotice(storage, "one", kind);
    expect(noticeDismissed(storage, "one", kind)).toBe(true);
    expect(noticeDismissed(storage, "two", kind)).toBe(false);
  });
}
test("SMS login is disabled by default", () => expect(PHONE_LOGIN_ENABLED).toBe(false));