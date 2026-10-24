import { describe, expect, it } from "bun:test";

import { cardKindsForMode, DEFAULT_LIVE_MODE, LIVE_MODES, liveMode } from "./modes";

describe("конфиг режимов эфира", () => {
  it("пять режимов в заданном порядке", () => {
    expect(LIVE_MODES.map((m) => m.id)).toEqual(["talk", "work", "learn", "family", "cinema"]);
  });

  it("названия и подсказки на русском", () => {
    expect(liveMode("talk").title).toBe("Разговор");
    expect(liveMode("talk").hint).toBe("просто поговорить");
    expect(liveMode("work").title).toBe("Работа");
    expect(liveMode("learn").title).toBe("Обучение");
    expect(liveMode("family").title).toBe("Семья");
    expect(liveMode("cinema").title).toBe("Кино");
  });

  it("кино недоступно, остальные доступны", () => {
    expect(liveMode("cinema").available).toBe(false);
    for (const id of ["talk", "work", "learn", "family"] as const) {
      expect(liveMode(id).available).toBe(true);
    }
  });

  it("неизвестный режим даёт Разговор", () => {
    expect(liveMode("party").id).toBe("talk");
    expect(liveMode(null).id).toBe("talk");
    expect(liveMode(undefined).id).toBe("talk");
    expect(DEFAULT_LIVE_MODE).toBe("talk");
  });

  it("виды карточек по режиму и в его порядке", () => {
    expect(cardKindsForMode("talk")).toEqual(["photo", "link", "note", "question"]);
    expect(cardKindsForMode("work")).toEqual(["note", "question", "link", "photo"]);
    expect(cardKindsForMode("learn")).toEqual(["question", "photo", "link", "note"]);
    expect(cardKindsForMode("family")).toEqual(["photo", "note", "link"]);
  });

  it("эфир без режима показывает все четыре вида", () => {
    expect(cardKindsForMode(null)).toEqual(["photo", "link", "note", "question"]);
    expect(cardKindsForMode(undefined)).toEqual(["photo", "link", "note", "question"]);
  });
});
