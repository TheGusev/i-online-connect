import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ya-online-profile-collapsed";

/** Состояние свёрнутости профиля, сохраняемое в localStorage. */
export function useProfileCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setCollapsed(raw === "true");
    } catch {
      // localStorage недоступен — оставляем развёрнутым.
    }
    setHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { collapsed, toggle, hydrated };
}
