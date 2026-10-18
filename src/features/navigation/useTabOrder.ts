import { useCallback, useEffect, useState } from "react";

import { loadTabOrder, saveTabOrder, TAB_ORDER_KEY, type TabPath } from "./tab-order";

/** Текущий порядок вкладок: читает localStorage и подписывается на изменения между вкладками браузера. */
export function useTabOrder(): [TabPath[], (order: TabPath[]) => void] {
  const [order, setOrder] = useState<TabPath[]>(() =>
    typeof window === "undefined" ? loadTabOrder(null) : loadTabOrder(window.localStorage),
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TAB_ORDER_KEY) setOrder(loadTabOrder(window.localStorage));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: TabPath[]) => {
    setOrder(next);
    saveTabOrder(window.localStorage, next);
  }, []);

  return [order, update];
}
