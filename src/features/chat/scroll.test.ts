import { describe, expect, it } from "vitest";
import { isNearBottom } from "./scroll";

describe("isNearBottom", () => {
  it("true at the very bottom", () => expect(isNearBottom(600, 400, 1000)).toBe(true));
  it("true within 120 px", () => expect(isNearBottom(480, 400, 1000)).toBe(true));
  it("false farther than 120 px", () => expect(isNearBottom(479, 400, 1000)).toBe(false));
  it("respects custom threshold", () => expect(isNearBottom(500, 400, 1000, 50)).toBe(false));
});
