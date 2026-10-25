import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardKindsForMode, DEFAULT_LIVE_MODE, LIVE_MODES, liveMode } from "./modes";

describe("конфиг режимов эфира", () => {
  it("пять режимов в заданном порядке", () => {
    assert.deepEqual(LIVE_MODES.map((m) => m.id), ["talk", "work", "learn", "family", "cinema"]);
  });

  it("названия и подсказки на русском", () => {
    assert.equal(liveMode("talk").title, "Разговор");
    assert.equal(liveMode("talk").hint, "просто поговорить");
    assert.equal(liveMode("work").title, "Работа");
    assert.equal(liveMode("learn").title, "Обучение");
    assert.equal(liveMode("family").title, "Семья");
    assert.equal(liveMode("cinema").title, "Кино");
  });

  it("кино недоступно, остальные доступны", () => {
    assert.equal(liveMode("cinema").available, false);
    for (const id of ["talk", "work", "learn", "family"] as const) {
      assert.equal(liveMode(id).available, true);
    }
  });

  it("неизвестный режим даёт Разговор", () => {
    assert.equal(liveMode("party").id, "talk");
    assert.equal(liveMode(null).id, "talk");
    assert.equal(liveMode(undefined).id, "talk");
    assert.equal(DEFAULT_LIVE_MODE, "talk");
  });

  it("виды карточек по режиму и в его порядке", () => {
    assert.deepEqual(cardKindsForMode("talk"), ["photo", "link", "note", "question"]);
    assert.deepEqual(cardKindsForMode("work"), ["note", "question", "link", "photo"]);
    assert.deepEqual(cardKindsForMode("learn"), ["question", "photo", "link", "note"]);
    assert.deepEqual(cardKindsForMode("family"), ["photo", "note", "link"]);
  });

  it("эфир без режима показывает все четыре вида", () => {
    assert.deepEqual(cardKindsForMode(null), ["photo", "link", "note", "question"]);
    assert.deepEqual(cardKindsForMode(undefined), ["photo", "link", "note", "question"]);
  });
});
