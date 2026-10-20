import { test } from "node:test";
import assert from "node:assert/strict";

import { lockBodyScroll } from "./scroll-lock";

interface OverflowState {
  value: string;
  writes: number;
}

/** Тестовая замена document.body без DOM: счётчик работает одинаково. */
function stubDocument(): OverflowState {
  const state: OverflowState = { value: "", writes: 0 };
  (globalThis as { document?: unknown }).document = {
    body: {
      style: {
        get overflow() {
          return state.value;
        },
        set overflow(next: string) {
          state.writes += 1;
          state.value = next;
        },
      },
    },
  };
  return state;
}

function unstubDocument() {
  delete (globalThis as { document?: unknown }).document;
}

test("блокирует с первой блокировки и держит hidden, пока жива вторая", () => {
  const overflow = stubDocument();
  const unlockA = lockBodyScroll();
  assert.equal(overflow.value, "hidden");
  const unlockB = lockBodyScroll();
  unlockA();
  assert.equal(overflow.value, "hidden");
  unlockB();
  assert.equal(overflow.value, "");
  unstubDocument();
});

test("в прямом порядке исходное значение возвращается после последней блокировки", () => {
  const overflow = stubDocument();
  overflow.value = "auto";
  const writesBefore = overflow.writes;
  const unlockA = lockBodyScroll();
  const unlockB = lockBodyScroll();
  assert.equal(overflow.value, "hidden");
  unlockA();
  assert.equal(overflow.value, "hidden");
  unlockB();
  assert.equal(overflow.value, "auto");
  unlockA();
  unlockB();
  assert.equal(overflow.value, "auto");
  // Одна блокировка: одно hidden + одно восстановление, повторные unlock не пишут.
  assert.equal(overflow.writes - writesBefore, 2);
  unstubDocument();
});

test("в обратном порядке восстановление происходит ровно один раз", () => {
  const overflow = stubDocument();
  overflow.value = "scroll";
  const writesBefore = overflow.writes;
  const unlockA = lockBodyScroll();
  const unlockB = lockBodyScroll();
  unlockB();
  assert.equal(overflow.value, "hidden");
  unlockA();
  assert.equal(overflow.value, "scroll");
  unlockA();
  unlockB();
  assert.equal(overflow.value, "scroll");
  assert.equal(overflow.writes - writesBefore, 2);
  unstubDocument();
});

test("повторный unlock одной функции идемпотентен и не сбрасывает другие блокировки", () => {
  const overflow = stubDocument();
  const unlockA = lockBodyScroll();
  lockBodyScroll();
  lockBodyScroll();
  assert.equal(overflow.value, "hidden");
  unlockA();
  unlockA();
  assert.equal(overflow.value, "hidden");
  unstubDocument();
});
