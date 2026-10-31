import { useCallback, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import { BottomSheet, Button } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

import { PhoneAuthFlow } from "./PhoneAuthFlow";
import { PHONE_LOGIN_ENABLED, needsFirstEntry } from "../first-entry";
import { SocialLoginButtons } from "../SocialLoginButtons";
import { ShortEntry } from "../ShortEntry";

/**
 * Гостевой вход «на месте»: guard(action) сразу выполняет действие, если вход есть,
 * иначе открывает нижнее окно со входом и продолжает действие после него.
 */
export function useAuthGate() {
  const authed = useSessionStore((state) => state.status === "authed");
  const user = useSessionStore(state => state.user);
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const guard = useCallback(
    (action: () => void) => {
      if (authed && !needsFirstEntry(user)) {
        action();
        return;
      }
      pending.current = action;
      setOpen(true);
    },
    [authed, user],
  );

  const sheet = (
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Вход">
      {authed && needsFirstEntry(user) ? <ShortEntry /> : PHONE_LOGIN_ENABLED ? <PhoneAuthFlow
        onDone={() => {
          setOpen(false);
          const action = pending.current;
          pending.current = null;
          // Даём сессии примениться, затем продолжаем начатое действие.
          if (action) window.setTimeout(action, 0);
        }}
      /> : <div className="space-y-3"><SocialLoginButtons /><Button asChild fullWidth variant="secondary"><Link to="/auth">Войти по почте</Link></Button><Button asChild fullWidth variant="ghost"><Link to="/onboarding">Создать аккаунт</Link></Button></div>}
    </BottomSheet>
  );

  return { guard, sheet, authed };
}
