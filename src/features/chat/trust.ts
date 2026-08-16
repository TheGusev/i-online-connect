import type { TrustLevel as ApiTrustLevel } from "@/api";
import type { TrustLevel as BadgeLevel } from "@/components/ds";

/** Уровни доверия из API приводим к уровням бейджа дизайн-системы. */
export function badgeLevel(level: ApiTrustLevel): BadgeLevel {
  if (level === "new") return "new";
  if (level === "verified") return "confirmed";
  return "trusted";
}
