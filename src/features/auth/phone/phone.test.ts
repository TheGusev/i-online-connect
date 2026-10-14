import { describe, expect, it } from "vitest";

import { formatNational, nationalDigits, normalizeRuPhone } from "./phone";

describe("phone normalization", () => {
  it("accepts 8-, +7- and bare formats", () => {
    expect(normalizeRuPhone("8 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizeRuPhone("+7 999 123 45 67")).toBe("+79991234567");
    expect(normalizeRuPhone("9991234567")).toBe("+79991234567");
  });
  it("rejects incomplete numbers", () => {
    expect(normalizeRuPhone("999123")).toBeNull();
  });
  it("pasted number is masked", () => {
    expect(formatNational(nationalDigits("+7 (999) 123-45-67"))).toBe("999 123-45-67");
  });
});
