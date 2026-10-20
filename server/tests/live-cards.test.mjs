import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLinkUrl, validateCardInput, canDeleteCard, canResolve, canAddCard, toLiveCardDto, MAX_CARDS_PER_SESSION,
} from "../src/live/cards.ts";

test("ссылка: http/https нормализуется, домен без www", () => {
  const r = normalizeLinkUrl("  https://www.Example.com/a?b=1 ");
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { url: "https://www.example.com/a?b=1", domain: "example.com" });
});

test("ссылка: запрещены другие схемы, логин/пароль, управляющие символы, длина > 500", () => {
  assert.equal(normalizeLinkUrl("javascript:alert(1)").ok, false);
  assert.equal(normalizeLinkUrl("ftp://x.ru/f").ok, false);
  assert.equal(normalizeLinkUrl("https://user:pass@x.ru/").ok, false);
  assert.equal(normalizeLinkUrl("https://x.ru/\u0000a").ok, false);
  assert.equal(normalizeLinkUrl("https://x.ru/" + "a".repeat(500)).ok, false);
  assert.equal(normalizeLinkUrl("не ссылка").ok, false);
});

test("валидация по виду", () => {
  assert.equal(validateCardInput({ kind: "note", text: "  " }).ok, false);
  assert.equal(validateCardInput({ kind: "question", text: "Как дела?" }).ok, true);
  assert.equal(validateCardInput({ kind: "note", text: "a".repeat(501) }).ok, false);
  assert.equal(validateCardInput({ kind: "link", url: "https://x.ru" }).ok, true);
  assert.equal(validateCardInput({ kind: "link" }).ok, false);
  assert.equal(validateCardInput({ kind: "photo" }).ok, false);
  assert.equal(validateCardInput({ kind: "photo", hasMedia: true }).ok, true);
});

test("права: автор или начавший эфир", () => {
  const card = { authorId: "a" };
  assert.equal(canDeleteCard("a", card, "h"), true);
  assert.equal(canDeleteCard("h", card, "h"), true);
  assert.equal(canDeleteCard("x", card, "h"), false);
  assert.equal(canDeleteCard("x", card, null), false);
  assert.equal(canResolve("h", card, "h"), true);
  assert.equal(canResolve("x", card, "h"), false);
});

test("лимит 40 карточек на сессию", () => {
  assert.equal(MAX_CARDS_PER_SESSION, 40);
  assert.equal(canAddCard(39), true);
  assert.equal(canAddCard(40), false);
});

test("формат DTO", () => {
  const dto = toLiveCardDto({ id: "c1", kind: "link", author_id: "u1", text: "", url: "https://www.x.ru/", media_url: null, media_mime: null, status: "open", created_at: "2026-10-20T00:00:00Z", client_temp_id: "t1" });
  assert.deepEqual(dto, { id: "c1", kind: "link", authorId: "u1", text: "", url: "https://www.x.ru/", domain: "x.ru", status: "open", createdAt: "2026-10-20T00:00:00.000Z", clientTempId: "t1" });
});
