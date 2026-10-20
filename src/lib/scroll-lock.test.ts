import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lockBodyScroll } from "./scroll-lock";

interface OverflowState {
  value: string;
  writes: number;
}

/** Тестовая замена document.body без DOM-окружения: счётчик работает одинаково. */
function stubDocument(): OverflowState {
  const state: OverflowState = { value: "", writes: 0 };
  vi.stubGlobal("document", {
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
  });
  return state;
}

describe("lockBodyScroll", () => {
  let overflow: OverflowState;

  beforeEach(() => {
    overflow = stubDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks on first lock and keeps hiding while another lock is held", () => {
    const unlockA = lockBodyScroll();
    expect(overflow.value).toBe("hidden");
    const unlockB = lockBodyScroll();
    unlockA();
    expect(overflow.value).toBe("hidden");
    unlockB();
    expect(overflow.value).toBe("");
  });

  it("restores the original value only after the last lock is released (forward order)", () => {
    overflow.value = "auto";
    const writesBefore = overflow.writes;
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    expect(overflow.value).toBe("hidden");
    unlockA();
    expect(overflow.value).toBe("hidden");
    unlockB();
    expect(overflow.value).toBe("auto");
    // Один lock -> одно hidden + одно restore; повторные unlock ничего не пишут.
    unlockA();
    unlockB();
    expect(overflow.value).toBe("auto");
    expect(overflow.writes - writesBefore).toBe(2);
  });

  it("restores exactly once even when released in reverse order", () => {
    overflow.value = "scroll";
    const writesBefore = overflow.writes;
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    unlockB();
    expect(overflow.value).toBe("hidden");
    unlockA();
    expect(overflow.value).toBe("scroll");
    // Повторный вызов той же unlock ничего не меняет и не пишет.
    unlockA();
    unlockB();
    expect(overflow.value).toBe("scroll");
    expect(overflow.writes - writesBefore).toBe(2);
  });

  it("is idempotent when unlocked early and still counts the remaining locks", () => {
    const unlockA = lockBodyScroll();
    lockBodyScroll();
    lockBodyScroll();
    expect(overflow.value).toBe("hidden");
    unlockA();
    unlockA();
    expect(overflow.value).toBe("hidden");
  });
});
