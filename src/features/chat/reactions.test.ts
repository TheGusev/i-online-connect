import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import { MORE_REACTIONS, QUICK_REACTIONS, REACTIONS_PER_USER, applyMyReaction, mergeRemoteReactions } from "./reactions";

test("ставит мою реакцию", () => {
    assert.deepEqual(applyMyReaction([], "👍", "put"), [{ emoji: "👍", count: 1, mine: true }]);
  });
test("новая реакция заменяет прежнюю при лимите 1", () => {
    const next = applyMyReaction([{ emoji: "👍", count: 2, mine: true }], "🔥", "put");
    assert.deepEqual(next, [{ emoji: "👍", count: 1, mine: false }, { emoji: "🔥", count: 1, mine: true }]);
  });
test("снятие не трогает чужую реакцию", () => {
    assert.deepEqual(applyMyReaction([{ emoji: "❤️", count: 2, mine: true }], "❤️", "delete"), [{ emoji: "❤️", count: 1, mine: false }]);
  });
test("событие собеседника сохраняет мои флаги", () => {
    expect(mergeRemoteReactions([{ emoji: "👍", count: 1, mine: true }], [{ emoji: "👍", count: 2 }], false, ["👍"]))
      .toEqual([{ emoji: "👍", count: 2, mine: true }]);
  });
test("лимит и список эмодзи совпадают с сервером", () => {
    const server = readFileSync("server/src/chat/reactions.ts", "utf8");
    assert.ok((server).includes(`REACTIONS_PER_USER = ${REACTIONS_PER_USER}`));
    assert.ok((server).includes(JSON.stringify(QUICK_REACTIONS).replace(/,/g, ", ")));
    assert.ok((server).includes(`"${MORE_REACTIONS.join(" ")}"`));
  });

