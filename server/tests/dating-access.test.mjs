import assert from "node:assert/strict";
import { test } from "node:test";

import { datingAccess, evaluateCompleteness } from "../src/profile/completeness.ts";

const full = { name: "Анна", age: 27, city: "Новосибирск", intent: "serious", bio: "О себе", interests: 3, valuesText: "Честность", joyText: "Рассветы", photos: 1 };

test("неполная анкета: запрос «Знакомств» → 403 PROFILE_INCOMPLETE", () => {
  const { complete } = evaluateCompleteness({ ...full, photos: 0 });
  assert.equal(complete, false);
  assert.equal(datingAccess("dating", complete), "forbidden");
});

test("гость: «Знакомства» закрыты, в общей ленте их нет", () => {
  assert.equal(datingAccess("dating", false), "forbidden");
  assert.equal(datingAccess(undefined, false), "exclude");
});

test("полная анкета открывает «Знакомства»", () => {
  const result = evaluateCompleteness(full);
  assert.deepEqual([result.complete, result.filled, result.total], [true, 9, 9]);
  assert.equal(datingAccess("dating", true), "include");
  assert.equal(datingAccess(undefined, true), "include");
});

test("остальные категории доступны как раньше", () => {
  assert.equal(datingAccess("service", false), "include");
});

test("цель «не определился» и меньше 3 интересов не засчитываются", () => {
  const result = evaluateCompleteness({ ...full, intent: "unsure", interests: 2 });
  assert.deepEqual(result.missing, ["intent", "interests"]);
});
