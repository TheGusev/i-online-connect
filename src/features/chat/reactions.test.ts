import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MORE_REACTIONS, QUICK_REACTIONS, REACTIONS_PER_USER, applyMyReaction, mergeRemoteReactions } from "./reactions";

describe("реакции", () => {
  it("ставит мою реакцию", () => {
    expect(applyMyReaction([], "👍", "put")).toEqual([{ emoji: "👍", count: 1, mine: true }]);
  });
  it("новая реакция заменяет прежнюю при лимите 1", () => {
    const next = applyMyReaction([{ emoji: "👍", count: 2, mine: true }], "🔥", "put");
    expect(next).toEqual([{ emoji: "👍", count: 1, mine: false }, { emoji: "🔥", count: 1, mine: true }]);
  });
  it("снятие не трогает чужую реакцию", () => {
    expect(applyMyReaction([{ emoji: "❤️", count: 2, mine: true }], "❤️", "delete")).toEqual([{ emoji: "❤️", count: 1, mine: false }]);
  });
  it("событие собеседника сохраняет мои флаги", () => {
    expect(mergeRemoteReactions([{ emoji: "👍", count: 1, mine: true }], [{ emoji: "👍", count: 2 }], false, ["👍"]))
      .toEqual([{ emoji: "👍", count: 2, mine: true }]);
  });
  it("лимит и список эмодзи совпадают с сервером", () => {
    const server = readFileSync("server/src/chat/reactions.ts", "utf8");
    expect(server).toContain(`REACTIONS_PER_USER = ${REACTIONS_PER_USER}`);
    expect(server).toContain(JSON.stringify(QUICK_REACTIONS).replace(/,/g, ", "));
    expect(server).toContain(`"${MORE_REACTIONS.join(" ")}"`);
  });
});
