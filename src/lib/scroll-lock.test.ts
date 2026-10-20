import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lockBodyScroll } from "./scroll-lock";

/** Тестовая замена document.body без DOM-окружения: счётчик работает одинаково. */
function stubDocument() {
  const overflowState = { value: "" };
  vi.stubGlobal("document", {
    body: {
      style: {
        get overflow() {
          return overflowState.value;
        },
        set overflow(next: string) {
          overflowState.value = next;
        },
      },
    },
  });
  return overflowState;
}

describe("lockBodyScroll", () => {
  let overflow: { value: string };

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

  it("restores the original value exactly once after nested locks", () => {
    overflow.value = "auto";
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    expect(overflow.value).toBe("hidden");
    // Разрядка в прямом порядке: значение возвращается только после последнего.
    unlockA();
    expect(overflow.value).toBe("hidden");
    unlockB();
    expect(overflow.value).toBe("auto");
    // Повторный вызов той же unlock ничего не меняет.
    unlockA();
    unlockB();
    expect(overflow.value).toBe("auto");
  });

  it("writes the restore exactly once, even with repeated unlocks in any order", () => {
    overflow.value = "scroll";
    let writes = 0;
    const watch = vi.spyOn(overflow, "value", "set").mockImplementation((next: string) => {
      if (next === "scroll") writes += 1;
    });
    // Разрядка в обратном порядке.
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    unlockB();
    expect(overflow.value).toBe("hidden");
    unlockA();
    unlockA();
    unlockB();
    // Исходное значение вернулось ровно один раз, повторные unlock не пишут.
    expect(writes).toBe(1);
    watch.mockRestore();
  });

  it("is idempotent when unlocked early and still counts the remaining lock", () => {
    const unlockA = lockBodyScroll();
    lockBodyScroll();
    lockBodyScroll();
    expect(overflow.value).toBe("hidden");
    unlockA();
    unlockA();
    expect(overflow.value).toBe("hidden");
  });
});
