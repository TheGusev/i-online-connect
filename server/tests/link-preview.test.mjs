/**
 * Предпросмотр ссылок: SSRF-проверка адресов, нормализация хоста,
 * линейный парсер (не зависает на битом HTML), rate limit.
 * Запуск: node --experimental-strip-types --test tests/link-preview.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isPublicAddress,
  normalizeHost,
  safeUrl,
} from "../src/security/safe-fetch.ts";
import { parsePreview, rateLimitOk } from "../src/routes/link-preview.ts";

test("приватные IPv4 отклоняются", () => {
  for (const ip of [
    "10.0.0.1",
    "10.255.255.255",
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254", // метаданные облака
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "0.0.0.0",
    "100.64.0.1", // CGNAT
    "100.127.255.255",
    "192.0.2.1", // TEST-NET-1
    "198.51.100.1", // TEST-NET-2
    "203.0.113.1", // TEST-NET-3
    "224.0.0.1", // multicast
    "240.0.0.1", // зарезервировано
    "255.255.255.255",
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("публичные IPv4 и границы диапазонов пропускаются", () => {
  for (const ip of [
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255", // граница 172.16/12 снизу
    "172.32.0.1", // граница сверху
    "100.63.255.255", // граница CGNAT снизу
    "100.128.0.1", // граница CGNAT сверху
    "169.253.0.1", // граница link-local
    "11.0.0.1",
    "223.255.255.255",
  ]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test("приватные и служебные IPv6 отклоняются", () => {
  for (const ip of [
    "::1",
    "::",
    "fc00::1",
    "fd00::abcd",
    "fe80::1",
    "febf::1",
    "ff02::1", // multicast
    "2001:db8::1", // documentation
    "64:ff9b::1", // NAT64
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("IPv4-mapped IPv6 проверяется как IPv4", () => {
  assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
  assert.equal(isPublicAddress("::ffff:10.0.0.1"), false);
  assert.equal(isPublicAddress("::ffff:192.168.0.1"), false);
  assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
  // Развёрнутая форма mapped-адреса.
  assert.equal(isPublicAddress("0:0:0:0:0:ffff:7f00:1"), false);
  assert.equal(isPublicAddress("0:0:0:0:0:ffff:808:808"), true);
});

test("публичный IPv6 пропускается", () => {
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("2a03:2880:f10a:83:face:b00c:0:25de"), true);
});

test("нормализация хоста: точки, регистр, служебные зоны", () => {
  assert.equal(normalizeHost("Example.COM."), "example.com");
  assert.equal(normalizeHost("example.com.."), "example.com");
  assert.equal(normalizeHost("localhost"), null);
  assert.equal(normalizeHost("localhost."), null);
  assert.equal(normalizeHost("a.localhost"), null);
  assert.equal(normalizeHost("printer.local"), null);
  assert.equal(normalizeHost("db.internal"), null);
  assert.equal(normalizeHost("nas.lan"), null);
  assert.equal(normalizeHost("router.home.arpa"), null);
  assert.equal(normalizeHost("nodots"), null);
  assert.equal(normalizeHost(""), null);
  // Punycode-имена с точкой допустимы, проверка уйдёт в DNS.
  assert.equal(normalizeHost("xn--80a1af.xn--p1ai"), "xn--80a1af.xn--p1ai");
});

test("safeUrl: только http/https и порты 80/443", () => {
  assert.ok(safeUrl("https://example.com/page"));
  assert.ok(safeUrl("http://example.com"));
  assert.equal(safeUrl("ftp://example.com"), null);
  assert.equal(safeUrl("file:///etc/passwd"), null);
  assert.equal(safeUrl("https://example.com:8443/"), null);
  assert.equal(safeUrl("http://example.com:8080/"), null);
  assert.ok(safeUrl("https://example.com:443/"));
  assert.ok(safeUrl("http://example.com:80/"));
  assert.equal(safeUrl("https://127.0.0.1/"), null); // приватный IP как хост
  assert.equal(safeUrl("https://localhost./"), null);
  assert.equal(safeUrl("не url"), null);
});

test("парсер: og:title и <title>", () => {
  const url = new URL("https://example.com/page");
  const og = parsePreview(
    '<html><head><meta property="og:title" content="Заголовок &amp; статья"><title>Иное</title></head></html>',
    url,
  );
  assert.equal(og.title, "Заголовок & статья");
  assert.equal(og.domain, "example.com");
  assert.equal("image" in og, false); // картинки больше не отдаём

  const plain = parsePreview("<html><head><title> Простой заголовок </title></head></html>", url);
  assert.equal(plain.title, "Простой заголовок");

  const none = parsePreview("<html><body>без заголовка</body></html>", url);
  assert.equal(none.title, null);

  const www = parsePreview("<title>x</title>", new URL("https://www.example.com/"));
  assert.equal(www.domain, "example.com");
});

test("парсер не зависает на длинной строке из <meta без >", () => {
  const url = new URL("https://example.com/");
  const broken = "<html><head>" + "<meta ".repeat(1) + "a".repeat(200_000);
  const started = performance.now();
  const result = parsePreview(broken, url);
  const elapsed = performance.now() - started;
  assert.equal(result.title, null);
  assert.ok(elapsed < 100, `парсер занял ${elapsed.toFixed(1)} мс`);
});

test("парсер не зависает на множестве незакрытых тегов", () => {
  const url = new URL("https://example.com/");
  const broken = "<meta ".repeat(5_000);
  const started = performance.now();
  parsePreview(broken, url);
  assert.ok(performance.now() - started < 100);
});

test("тег длиннее 1000 символов пропускается", () => {
  const url = new URL("https://example.com/");
  const longTag = `<meta property="og:title" content="${"x".repeat(2_000)}">`;
  const html = `${longTag}<title>Реальный</title>`;
  const result = parsePreview(html, url);
  assert.equal(result.title, "Реальный");
});

test("rate limit: 20 запросов в минуту на пользователя", () => {
  const user = "user-rate-test";
  for (let i = 0; i < 20; i++) {
    assert.equal(rateLimitOk(user, 1_000_000), true, `запрос ${i + 1}`);
  }
  assert.equal(rateLimitOk(user, 1_000_000), false);
  // Другой пользователь не затронут.
  assert.equal(rateLimitOk("other-user", 1_000_000), true);
  // Через минуту окно сбрасывается.
  assert.equal(rateLimitOk(user, 1_000_000 + 61_000), true);
});
