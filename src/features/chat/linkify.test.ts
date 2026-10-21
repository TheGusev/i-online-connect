import { test } from "node:test";
import assert from "node:assert/strict";

import { isSuspiciousUrl, splitLinks } from "./linkify";

const links = (text: string) => splitLinks(text).filter((p) => p.type === "link").map((p) => (p as { href: string }).href);

test("находит http(s), www и голые домены", () => {
  assert.deepEqual(links("см https://a.ru/x и www.b.com"), ["https://a.ru/x", "https://www.b.com/"]);
  assert.deepEqual(links("тут example.ru/путь"), ["https://example.ru/%D0%BF%D1%83%D1%82%D1%8C"]);
});

test("хвостовая пунктуация не входит в ссылку", () => {
  const parts = splitLinks("Зайди на https://a.ru/x.");
  assert.deepEqual(parts.map((p) => p.value), ["Зайди на ", "https://a.ru/x", "."]);
  assert.deepEqual(links("(ссылка a.ru)!"), ["https://a.ru/"]);
});

test("e-mail не трогает", () => {
  assert.deepEqual(links("пиши на ivan@mail.ru"), []);
});

test("голый домен — только известная зона или с путём", () => {
  assert.deepEqual(links("привет.как дела"), []);
  assert.deepEqual(links("ок.завтра созвон"), []);
  assert.deepEqual(links("заходи на example.ru"), ["https://example.ru/"]);
  assert.deepEqual(links("тут example.ru/путь"), ["https://example.ru/%D0%BF%D1%83%D1%82%D1%8C"]);
  assert.deepEqual(links("сайт example.xyz работает"), ["https://example.xyz/"]);
});

test("никаких javascript: и data:", () => {
  assert.deepEqual(links("javascript:alert(1) data:text/html,x"), []);
});

test("текст без ссылок возвращается целиком", () => {
  assert.deepEqual(splitLinks("просто текст"), [{ type: "text", value: "просто текст" }]);
});

test("подозрительные ссылки", () => {
  assert.equal(isSuspiciousUrl("http://192.168.0.1/a"), true);
  assert.equal(isSuspiciousUrl("https://xn--80ak6aa92e.com/"), true);
  assert.equal(isSuspiciousUrl("https://user@evil.ru/"), true);
  assert.equal(isSuspiciousUrl("https://ya.ru/"), false);
});
