import { test } from "node:test";
import assert from "node:assert/strict";
import { getPhotoDimensions, rememberPhotoDimensions, photoAspectRatio } from "./photo-dimensions";
test("photo geometry survives local and remote identity replacement", () => {
  const size = { width: 1600, height: 800 };
  rememberPhotoDimensions("blob:photo", size);
  rememberPhotoDimensions("server-photo", size);
  assert.equal(photoAspectRatio(getPhotoDimensions("blob:photo")), 2);
  assert.equal(photoAspectRatio(getPhotoDimensions("server-photo")), 2);
});
test("portrait and panorama reserve bounded photo height", () => {
  assert.equal(photoAspectRatio({ width: 800, height: 1600 }), 1.06);
  assert.equal(photoAspectRatio({ width: 8000, height: 1000 }), 2.375);
});