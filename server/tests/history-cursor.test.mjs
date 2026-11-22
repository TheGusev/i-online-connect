import test from "node:test";
import assert from "node:assert/strict";
import { encodeHistoryCursor as encode, decodeHistoryCursor as decode } from "../src/chat/history-cursor.ts";

const id = "12345678-1234-4234-8234-123456789abc";
const at = "2026-11-20T12:00:00.123456Z";
const raw = value => "h1." + Buffer.from(JSON.stringify(value)).toString("base64url");

test("no cursor means first page", () => assert.deepEqual(decode(undefined), { at: null, id: null }));
test("composite cursor preserves all six fractional digits", () => {
  assert.deepEqual(decode(encode(at, id)), { at, id });
});
test("legacy ISO before is still accepted", () => {
  for (const value of ["2026-11-20T12:00:00Z", "2026-11-20T12:00:00.123Z", "2026-11-20T15:00:00.123+03:00"]) {
    assert.deepEqual(decode(value), { at: value, id: null });
  }
});
test("UUID is canonicalized", () => assert.equal(decode(encode(at, id.toUpperCase())).id, id));
test("bad format, unknown versions and oversized values are rejected", () => {
  for (const value of ["", "h2.abc", "h1.!", "h1.", "x".repeat(513), "yesterday"]) assert.throws(() => decode(value));
});
test("malformed and structurally invalid payloads are rejected", () => {
  for (const value of [null, {}, [], [at], [at, id, "extra"], [1, id], [at, "not-uuid"]]) assert.throws(() => decode(raw(value)));
  assert.throws(() => decode("h1." + Buffer.from("not json").toString("base64url")));
});
test("invalid calendar date is rejected", () => {
  assert.throws(() => decode("2026-02-30T12:00:00Z"));
  assert.throws(() => decode(raw(["2026-02-30T12:00:00.123456Z", id])));
});
test("composite encoder refuses Date-rounded timestamps", () => {
  assert.throws(() => encode("2026-11-20T12:00:00.123Z", id));
});
test("leap day and zero microseconds remain valid", () => {
  const leap = "2028-02-29T00:00:00.000000Z";
  assert.equal(decode(encode(leap, id)).at, leap);
});

function walk(rows, limit) {
  let before;
  const result = [];
  for (let step = 0; step < 1000; step += 1) {
    const cursor = decode(before);
    const selected = rows.filter(row => cursor.at === null || row.at < cursor.at ||
      (cursor.id !== null && row.at === cursor.at && row.id < cursor.id))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit + 1);
    const page = selected.slice(0, limit);
    result.push(...page);
    if (selected.length <= limit) return result;
    const last = page[page.length - 1];
    before = encode(last.at, last.id);
  }
  throw new Error("Pagination did not terminate");
}
const row = (n, time = at) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, at: time });
for (const count of [0, 1, 49, 50, 51, 120]) test(`model: ${count} equal timestamps paginate without loss`, () => {
  const rows = Array.from({ length: count }, (_, i) => row(i + 1));
  const actual = walk(rows, 50);
  assert.equal(actual.length, count);
  assert.equal(new Set(actual.map(item => item.id)).size, count);
});
test("model: microsecond differences survive page boundaries", () => {
  const rows = Array.from({ length: 120 }, (_, i) => row(i + 1, `2026-11-20T12:00:00.${String(123001 + i).padStart(6, "0")}Z`));
  assert.deepEqual(walk(rows, 17).map(item => item.id), [...rows].reverse().map(item => item.id));
});
test("model: deleting boundary row does not invalidate encoded cursor", () => {
  const rows = Array.from({ length: 120 }, (_, i) => row(i + 1));
  const boundary = row(71);
  const cursor = decode(encode(boundary.at, boundary.id));
  const remaining = rows.filter(item => item.id !== boundary.id)
    .filter(item => item.at < cursor.at || (item.at === cursor.at && item.id < cursor.id));
  assert.equal(remaining.length, 70);
});
