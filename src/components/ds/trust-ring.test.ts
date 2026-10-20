import { describe, expect, it } from "vitest";

import { getTrustLevel } from "./trust-ring";

describe("getTrustLevel", () => {
  it("none для нового участника и пустых данных", () => {
    expect(getTrustLevel({ trustLevel: "new" })).toBe("none");
    expect(getTrustLevel(null)).toBe("none");
  });
  it("verified для проверенного участника", () => {
    expect(getTrustLevel({ trustLevel: "trusted" })).toBe("verified");
  });
  it("video выше verified", () => {
    expect(getTrustLevel({ trustLevel: "trusted", trust: { videoVerified: true } })).toBe("video");
    expect(getTrustLevel({ trustLevel: "verified" })).toBe("video");
  });
  it("special выше video", () => {
    expect(getTrustLevel({ trustLevel: "ambassador", trust: { videoVerified: true } })).toBe("special");
  });
});
