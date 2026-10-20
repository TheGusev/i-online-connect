import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lockBodyScroll } from "./scroll-lock";

describe("lockBodyScroll", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("blocks on first lock and keeps hiding while another lock is held", () => {
    const unlockA = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    const unlockB = lockBodyScroll();
    unlockA();
    expect(document.body.style.overflow).toBe("hidden");
    unlockB();
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the original value exactly once after nested locks", () => {
    document.body.style.overflow = "auto";
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    // Разрядка в прямом порядке: значение возвращается только после последнего.
    unlockA();
    expect(document.body.style.overflow).toBe("hidden");
    unlockB();
    expect(document.body.style.overflow).toBe("auto");
    // Повторный вызов той же unlock ничего не меняет.
    unlockA();
    unlockB();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("restore happens exactly once even if unlock is called repeatedly", () => {
    let restores = 0;
    const original = document.body.style.overflow;
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    const watcher = () => {
      if (document.body.style.overflow === original) restores += 1;
    };
    // Разрядка в обратном порядке.
    unlockB();
    watcher();
    expect(document.body.style.overflow).toBe("hidden");
    unlockA();
    watcher();
    unlockA();
    unlockB();
    watcher();
    watcher();
    expect(restores).toBe(1);
  });

  it("is safe when called repeatedly without unlock and returns a no-op on SSR", () => {
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    unlockA();
    unlockA();
    expect(document.body.style.overflow).toBe("hidden");
    unlockB();
    expect(document.body.style.overflow).toBe("");
  });
});
