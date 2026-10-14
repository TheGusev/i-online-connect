import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { LISTINGS, PEOPLE, allSeedImages } from "../scripts/seed-data.mjs";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "seed-assets");

test("в демо-данных нет двух одинаковых картинок", () => {
  const images = allSeedImages();
  const seen = new Set();
  const duplicates = images.filter((image) => (seen.has(image) ? true : (seen.add(image), false)));
  assert.deepEqual(duplicates, []);
});

test("у каждого объявления 1–3 фото, у каждого автора аватар", () => {
  for (const listing of LISTINGS) assert.ok(listing.photos.length >= 1 && listing.photos.length <= 3, listing.title);
  for (const person of PEOPLE) assert.ok(person[5], person[0]);
});

test("все картинки существуют в seed-assets", () => {
  const missing = allSeedImages().filter((image) => !existsSync(path.join(assets, image)));
  assert.deepEqual(missing, []);
});

test("каждая категория наполнена минимум 8 объявлениями", () => {
  const counts = {};
  for (const listing of LISTINGS) counts[listing.category] = (counts[listing.category] ?? 0) + 1;
  for (const category of ["dating", "service", "realty", "transport", "sale", "leisure", "travel", "help", "urgent"]) {
    assert.ok((counts[category] ?? 0) >= 8, category);
  }
});
