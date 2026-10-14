import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatNational, nationalDigits, normalizeRuPhone } from "./phone";

describe("phone normalization", () => {
  test("accepts 8-, +7- and bare formats", () => {
    assert.equal(normalizeRuPhone("8 (999) 123-45-67"), "+79991234567");
    assert.equal(normalizeRuPhone("+7 999 123 45 67"), "+79991234567");
    assert.equal(normalizeRuPhone("9991234567"), "+79991234567");
  });
  test("rejects incomplete numbers", () => {
    assert.equal(normalizeRuPhone("999123"), null);
  });
  test("pasted number is masked", () => {
    assert.equal(formatNational(nationalDigits("+7 (999) 123-45-67")), "999 123-45-67");
  });
});
