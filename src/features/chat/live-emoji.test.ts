import { test } from "node:test";
import assert from "node:assert/strict";

import { liveEmojiClass, liveEmojiDelay } from "./live-emoji";

test("шесть живых эмодзи получают свои классы", () => {
  assert.equal(liveEmojiClass("🔥"), "live-emoji--fire");
  assert.equal(liveEmojiClass("❤️"), "live-emoji--heart");
  assert.equal(liveEmojiClass("😂"), "live-emoji--laugh");
  assert.equal(liveEmojiClass("👍"), "live-emoji--thumb");
  assert.equal(liveEmojiClass("😮"), "live-emoji--wow");
  assert.equal(liveEmojiClass("😢"), "live-emoji--cry");
});

test("остальные эмодзи не анимируются", () => {
  assert.equal(liveEmojiClass("😎"), null);
  assert.equal(liveEmojiClass("🎉"), null);
  assert.equal(liveEmojiClass(""), null);
});

test("задержка детерминирована и в диапазоне (-1.6, 0]", () => {
  const a = liveEmojiDelay("🔥:3");
  assert.equal(a, liveEmojiDelay("🔥:3"));
  assert.ok(a <= 0 && a > -1.6);
});

test("разные элементы получают разные фазы", () => {
  const delays = new Set([0, 1, 2, 3, 4, 5].map((i) => liveEmojiDelay(`❤️:${i}`)));
  assert.ok(delays.size > 1);
});
