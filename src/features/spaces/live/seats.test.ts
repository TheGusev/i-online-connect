import { test } from "node:test";
import assert from "node:assert/strict";

import { assignSeats } from "./seats";

test("вход: занимают первые свободные лузы по порядку", () => {
  assert.deepEqual(assignSeats({}, ["a", "b", "c"], 8), { a: 0, b: 1, c: 2 });
});

test("выход: луза освобождается, остальные не перескакивают", () => {
  assert.deepEqual(assignSeats({ a: 0, b: 1, c: 2 }, ["a", "c"], 8), { a: 0, c: 2 });
});

test("новый участник занимает освободившуюся лузу", () => {
  assert.deepEqual(assignSeats({ a: 0, c: 2 }, ["a", "c", "d"], 8), { a: 0, c: 2, d: 1 });
});

test("повторный вход: человек садится в первую свободную, остальные на месте", () => {
  const afterLeave = assignSeats({ a: 0, b: 1, c: 2 }, ["b", "c"], 8);
  assert.deepEqual(assignSeats(afterLeave, ["b", "c", "a"], 8), { b: 1, c: 2, a: 0 });
});

test("больше людей, чем мест: лишние без лузы", () => {
  const seats = assignSeats({}, ["a", "b", "c", "d"], 3);
  assert.deepEqual(seats, { a: 0, b: 1, c: 2 });
  assert.equal("d" in seats, false);
});
