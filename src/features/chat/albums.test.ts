import { test } from "node:test";
import assert from "node:assert/strict";

import { groupMessages } from "./albums";

const at = (s: number) => new Date(Date.UTC(2026, 9, 15, 12, 0, s)).toISOString();
const photo = (id: string, authorId: string, s: number) => ({ id, authorId, createdAt: at(s), kind: "image" });
const text = (id: string, authorId: string, s: number) => ({ id, authorId, createdAt: at(s), kind: "text" });

const shape = (list: ReturnType<typeof groupMessages>) =>
  list.map((g) => (g.type === "album" ? g.messages.map((m) => m.id).join("+") : g.message.id));

test("подряд идущие фото одного автора — один альбом", () => {
  assert.deepEqual(shape(groupMessages([photo("a", "u1", 0), photo("b", "u1", 3), photo("c", "u1", 10)])), ["a+b+c"]);
});
test("фото разных авторов не объединяются", () => {
  assert.deepEqual(shape(groupMessages([photo("a", "u1", 0), photo("b", "u2", 1)])), ["a", "b"]);
});
test("разрыв больше 15 секунд начинает новую группу", () => {
  assert.deepEqual(shape(groupMessages([photo("a", "u1", 0), photo("b", "u1", 16), photo("c", "u1", 20)])), ["a", "b+c"]);
});
test("текст между фото разрывает альбом", () => {
  assert.deepEqual(
    shape(groupMessages([photo("a", "u1", 0), text("t", "u1", 1), photo("b", "u1", 2), photo("c", "u1", 3)])),
    ["a", "t", "b+c"],
  );
});
