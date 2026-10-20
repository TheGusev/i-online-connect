import assert from "node:assert/strict";
import { test } from "node:test";

import { getTrustLevel } from "./trust-ring";

test("none для нового участника и пустых данных", () => {
  assert.equal(getTrustLevel({ trustLevel: "new" }), "none");
  assert.equal(getTrustLevel(null), "none");
});
test("verified для проверенного участника", () => {
  assert.equal(getTrustLevel({ trustLevel: "trusted" }), "verified");
});
test("video выше verified", () => {
  assert.equal(getTrustLevel({ trustLevel: "trusted", trust: { videoVerified: true } }), "video");
  assert.equal(getTrustLevel({ trustLevel: "verified" }), "video");
});
test("special выше video", () => {
  assert.equal(getTrustLevel({ trustLevel: "ambassador", trust: { videoVerified: true } }), "special");
});
