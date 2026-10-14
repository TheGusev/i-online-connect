import { describe, expect, test } from "bun:test";

import { formatRemaining } from "./countdown";

const now = Date.parse("2026-10-15T00:00:00Z");
const at = (ms: number) => new Date(now + ms).toISOString();

describe("formatRemaining", () => {
  test("разные expiresAt дают разные значения", () => {
    const a = formatRemaining(at(20 * 60_000), now).text;
    const b = formatRemaining(at(5 * 3_600_000 + 7 * 60_000), now).text;
    const c = formatRemaining(at(3 * 86_400_000 + 4 * 3_600_000), now).text;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test("больше суток — «N дн ЧЧ ч»", () => {
    expect(formatRemaining(at(59 * 86_400_000 + 6 * 3_600_000 + 36 * 60_000), now).text).toBe("59 дн 06 ч");
  });

  test("меньше суток — ЧЧ:ММ", () => {
    expect(formatRemaining(at(5 * 3_600_000 + 7 * 60_000), now).text).toBe("05:07");
  });

  test("меньше часа — ММ:СС", () => {
    expect(formatRemaining(at(20 * 60_000 + 5_000), now).text).toBe("20:05");
  });

  test("истёкшее", () => {
    expect(formatRemaining(at(-1000), now).kind).toBe("expired");
  });
});
