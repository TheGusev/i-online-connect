import assert from "node:assert/strict";
import { test } from "node:test";

import { avatarIndicators, getTrustLevel } from "./trust-ring";

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
test("online trust shows only online halo and a badge", () => {
  for (const trust of ["verified", "video", "special"] as const) {
    assert.deepEqual(avatarIndicators(true, trust), { trustRing: false, badge: true });
  }
});
test("online none has no verification badge", () => assert.deepEqual(avatarIndicators(true, "none"), { trustRing: false, badge: false }));
test("offline trust and legacy verification retain their behavior", () => {
  assert.deepEqual(avatarIndicators(false, "video"), { trustRing: true, badge: false });
  assert.deepEqual(avatarIndicators(false, undefined, true), { trustRing: false, badge: true });
});
