import test from "node:test";
import assert from "node:assert/strict";
import { upsertMessagePages as upsert, removeMessagePages as remove,
  captureMessagePosition as capture, restoreMessagePages as restore } from "./message-pages.mjs";

const msg = n => ({ id: `m${String(n).padStart(3, "0")}`, text: `text-${n}`,
  authorId: n % 2 ? "me" : "peer", conversationId: "conversation-a", status: "sent" });
const fixture = () => [
  { items: Array.from({ length: 50 }, (_, i) => msg(i + 71)), hasMore: true, nextBefore: "cursor-071" },
  { items: Array.from({ length: 50 }, (_, i) => msg(i + 21)), hasMore: true, nextBefore: "cursor-021" },
  { items: Array.from({ length: 20 }, (_, i) => msg(i + 1)), hasMore: false, nextBefore: null },
];
const all = pages => [...pages].reverse().flatMap(page => page.items);
const ids = pages => all(pages).map(item => item.id);

for (const n of [10, 50, 110]) test(`edit loaded message ${n} in place`, () => {
  const before = fixture(); const next = upsert(before, { ...msg(n), text: "edited" });
  assert.equal(all(next).length, 120);
  assert.deepEqual(all(next).filter(item => item.id === msg(n).id).map(item => item.text), ["edited"]);
  assert.deepEqual(ids(next), ids(before));
});
for (const n of [10, 50, 110]) test(`delete loaded message ${n}`, () => {
  const before = fixture(); const next = remove(before, msg(n).id);
  assert.equal(all(next).length, 119);
  assert.equal(all(next).some(item => item.id === msg(n).id), false);
});
test("repeated new event has one copy", () => {
  const next = upsert(upsert(fixture(), msg(121)), msg(121));
  assert.equal(all(next).length, 121);
  assert.equal(all(next).filter(item => item.id === msg(121).id).length, 1);
});
test("replace optimistic id and clientTempId", () => {
  const optimistic = { ...msg(121), id: "tmp-x", clientTempId: "x", status: "sending" };
  const next = upsert(upsert(fixture(), optimistic), { ...msg(121), clientTempId: "x" }, "tmp-x");
  assert.equal(all(next).length, 121);
  assert.equal(all(next).some(item => item.id === "tmp-x"), false);
});
test("clientTempId never merges different authors", () => {
  const pages = [{ items: [{ ...msg(1), clientTempId: "same" }] }];
  assert.equal(all(upsert(pages, { ...msg(2), clientTempId: "same" })).length, 2);
});
test("clientTempId never merges different conversations", () => {
  const pages = [{ items: [{ ...msg(1), clientTempId: "same" }] }];
  const next = upsert(pages, { ...msg(3), conversationId: "other", clientTempId: "same" });
  assert.equal(all(next).length, 2);
});
test("remove duplicate copies across pages", () => {
  assert.deepEqual(remove([{ items: [msg(1)] }, { items: [msg(1)] }], msg(1).id).map(p => p.items), [[], []]);
});
test("upsert collapses copies across pages", () => {
  const next = upsert([{ items: [msg(1)] }, { items: [msg(1)] }], { ...msg(1), text: "fresh" });
  assert.equal(all(next).length, 1);
  assert.equal(all(next)[0].text, "fresh");
});
for (const n of [1, 10, 20, 21, 50, 70, 71, 120]) test(`failed delete restores position ${n}`, () => {
  const before = fixture(); const position = capture(before, msg(n).id);
  assert.deepEqual(restore(remove(before, msg(n).id), msg(n), position), before);
});
test("rollback preserves a new message that arrived meanwhile", () => {
  const before = fixture(); const position = capture(before, msg(10).id);
  const next = restore(upsert(remove(before, msg(10).id), msg(121)), msg(10), position);
  assert.deepEqual(ids(next), [...ids(before), msg(121).id]);
});
test("rollback does not overwrite a newer copy already present", () => {
  const before = fixture(); const position = capture(before, msg(10).id);
  const newer = upsert(before, { ...msg(10), text: "server-newer" });
  assert.strictEqual(restore(newer, msg(10), position), newer);
});
test("rollback of adjacent deletes works in either response order", () => {
  for (const order of [[10, 11], [11, 10]]) {
    const before = fixture();
    const a = capture(before, msg(10).id);
    let next = remove(before, msg(10).id);
    const b = capture(next, msg(11).id);
    next = remove(next, msg(11).id);
    for (const n of order) next = restore(next, msg(n), n === 10 ? a : b);
    assert.deepEqual(ids(next), ids(before));
  }
});
test("no restoration without an original position", () => {
  const before = fixture(); assert.strictEqual(restore(before, msg(121), null), before);
});
test("metadata and input remain unchanged", () => {
  const before = fixture(); const snapshot = JSON.stringify(before);
  const next = remove(upsert(before, { ...msg(10), text: "edited" }), msg(50).id);
  assert.equal(JSON.stringify(before), snapshot);
  assert.deepEqual(next.map(p => [p.hasMore, p.nextBefore]), before.map(p => [p.hasMore, p.nextBefore]));
  assert.strictEqual(next[0], before[0]);
});
test("unknown delete does not change page objects", () => {
  const before = fixture(); const next = remove(before, "absent");
  next.forEach((p, i) => assert.strictEqual(p, before[i]));
});
