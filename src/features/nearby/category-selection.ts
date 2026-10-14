import type { NeedCategory } from "@/api";

export const initialCategory: NeedCategory | null = null;

export function selectCategory(
  current: NeedCategory | null,
  clicked: NeedCategory,
  allowEmpty = true,
): NeedCategory | null {
  return allowEmpty && current === clicked ? null : clicked;
}