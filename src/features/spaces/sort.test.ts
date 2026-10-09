import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Space } from "@/api";
import { sortSpacesByInterests } from "./sort";

function space(title: string, interests: string[], membersCount: number): Space {
  return { title, interests, membersCount } as Space;
}

describe("sortSpacesByInterests", () => {
  test("ставит сообщества с большим числом совпавших интересов выше", () => {
    const result = sortSpacesByInterests(
      [space("Без совпадений", ["Театр"], 100), space("Два совпадения", ["Бег", "Книги"], 5)],
      ["Книги", "Бег"],
    );

    assert.deepEqual(result.map(({ title }) => title), ["Два совпадения", "Без совпадений"]);
  });

  test("при равном числе совпадений сортирует по числу участников", () => {
    const result = sortSpacesByInterests(
      [space("Маленькое", ["Бег"], 5), space("Большое", ["Бег"], 25)],
      ["Бег"],
    );

    assert.deepEqual(result.map(({ title }) => title), ["Большое", "Маленькое"]);
  });
});
