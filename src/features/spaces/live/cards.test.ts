import { test } from "node:test";
import assert from "node:assert/strict";

import type { LiveCard } from "@/api/types";
import { applyCardEvent, canManageCard, dropOptimistic, restoreCard, safeLink, tableCards } from "./cards";

const card = (id: string, extra: Partial<LiveCard> = {}): LiveCard => ({
  id, kind: "note", authorId: "u1", text: "т", status: "open", createdAt: "2026-10-20T00:00:00Z", clientTempId: `t-${id}`, ...extra,
});

test("card_added заменяет оптимистичную копию по clientTempId", () => {
  const optimistic = card("temp-1", { clientTempId: "x" });
  const next = applyCardEvent([optimistic], { type: "card_added", card: card("c1", { clientTempId: "x" }) });
  assert.deepEqual(next.map((c) => c.id), ["c1"]);
});

test("card_added не дублирует уже известную карточку", () => {
  const c = card("c1");
  assert.equal(applyCardEvent([c], { type: "card_added", card: c }).length, 1);
});

test("card_updated меняет статус, card_removed удаляет", () => {
  const list = [card("a"), card("b")];
  const updated = applyCardEvent(list, { type: "card_updated", card: card("b", { status: "resolved" }) });
  assert.equal(updated[1]!.status, "resolved");
  assert.deepEqual(applyCardEvent(updated, { type: "card_removed", cardId: "a" }).map((c) => c.id), ["b"]);
});

test("откат: оптимистичная карточка убирается, прежняя возвращается", () => {
  const list = [card("a"), card("temp-1", { clientTempId: "x" })];
  assert.deepEqual(dropOptimistic(list, "x").map((c) => c.id), ["a"]);
  const removed = [card("b")];
  assert.deepEqual(restoreCard(removed, card("a")).map((c) => c.id), ["b", "a"]);
});

test("ссылки только http/https", () => {
  assert.deepEqual(safeLink("https://www.x.ru/a"), { url: "https://www.x.ru/a", domain: "x.ru" });
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("ftp://x.ru"), null);
});

test("на столе последние 4, остальное — «ещё N»", () => {
  const list = ["1", "2", "3", "4", "5", "6"].map((id) => card(id));
  const { shown, more } = tableCards(list);
  assert.deepEqual(shown.map((c) => c.id), ["3", "4", "5", "6"]);
  assert.equal(more, 2);
});

test("управлять может автор или начавший эфир", () => {
  assert.equal(canManageCard("u1", card("a"), "h"), true);
  assert.equal(canManageCard("h", card("a"), "h"), true);
  assert.equal(canManageCard("x", card("a"), "h"), false);
});
