import { useCallback, useRef, useState } from "react";

import { BottomSheet } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

import { PhoneAuthFlow } from "./PhoneAuthFlow";

/**
 * Гостевой вход «на месте»: guard(action) сразу выполняет действие, если вход есть,
 * иначе открывает нижнее окно со входом и продолжает действие после него.
 */
export function useAuthGate() {
  const authed = useSessionStore((state) => state.status === "authed");
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const guard = useCallback(
    (action: () => void) => {
      if (authed) {
        action();
        return;
      }
      pending.current = action;
      setOpen(true);
    },
    [authed],
  );

  const sheet = (
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Вход">
      <PhoneAuthFlow
        onDone={() => {
          setOpen(false);
          const action = pending.current;
          pending.current = null;
          // Даём сессии примениться, затем продолжаем начатое действие.
          if (action) window.setTimeout(action, 0);
        }}
      />
    </BottomSheet>
  );

  return { guard, sheet, authed };
}
