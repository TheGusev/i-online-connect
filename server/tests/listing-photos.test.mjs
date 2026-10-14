import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LISTING_PHOTOS, checkListingPhotos } from "../src/listings/photos.ts";

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;

test("лимит фото объявления — 3", () => assert.equal(MAX_LISTING_PHOTOS, 3));
test("0–3 фото принимаются", () => {
  assert.equal(checkListingPhotos([]), null);
  assert.equal(checkListingPhotos([id(1), id(2), id(3)]), null);
});
test("4 фото — TOO_MANY_PHOTOS", () => {
  assert.equal(checkListingPhotos([id(1), id(2), id(3), id(4)]), "TOO_MANY_PHOTOS");
});
test("повтор одного фото отклоняется", () => {
  assert.equal(checkListingPhotos([id(1), id(1)]), "DUPLICATE_PHOTOS");
});
