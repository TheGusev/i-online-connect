import { useSyncExternalStore } from "react";

/** true, когда окно не уже px пикселей. На сервере и при первой отрисовке — false. */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined") return () => {};
      const query = window.matchMedia(`(min-width: ${px}px)`);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => typeof window !== "undefined" && window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false,
  );
}
