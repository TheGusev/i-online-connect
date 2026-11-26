import { test } from "node:test";
import assert from "node:assert/strict";

import type { Message } from "@/api";
import { overlayMessages, prependOlder, type MessageWindow } from "./message-window";

const msg = (id: string, text = id) => ({ id, text }) as unknown as Message;
const ids = (items: Message[]) => items.map((m) => m.id);

const windowOf = (items: Message[], nextBefore: string | null = "c1"): MessageWindow => ({
  conversationId: "conv",
  items,
  hasMore: nextBefore !== null,
  nextBefore,
  hasNewer: true,
});

test("overlayMessages: без живой ленты окно не меняется", () => {
  const items = [msg("a"), msg("b")];
  assert.equal(overlayMessages(items, undefined), items);
  assert.equal(overlayMessages(items, []), items);
});

test("overlayMessages: свежая версия подменяет сообщение, порядок сохраняется", () => {
  const result = overlayMessages(
    [msg("a"), msg("b", "старое"), msg("c")],
    [msg("b", "новое"), msg("z")],
  );
  assert.deepEqual(ids(result), ["a", "b", "c"]);
  assert.equal(result[1]?.text, "новое");
});

test("prependOlder: старая страница встаёт в начало, курсор обновляется", () => {
  const next = prependOlder(windowOf([msg("c"), msg("d")]), {
    items: [msg("a"), msg("b")],
    hasMore: true,
    nextBefore: "c2",
  });
  assert.deepEqual(ids(next.items), ["a", "b", "c", "d"]);
  assert.equal(next.nextBefore, "c2");
  assert.equal(next.hasMore, true);
  assert.equal(next.hasNewer, true);
});

test("prependOlder: дубли отбрасываются, конец истории закрывает подгрузку", () => {
  const next = prependOlder(windowOf([msg("b"), msg("c")]), {
    items: [msg("a"), msg("b")],
    hasMore: false,
    nextBefore: null,
  });
  assert.deepEqual(ids(next.items), ["a", "b", "c"]);
  assert.equal(next.hasMore, false);
  assert.equal(next.nextBefore, null);
});
