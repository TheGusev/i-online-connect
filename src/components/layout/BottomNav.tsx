import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useUnreadChatCount } from "@/features/chat/hooks";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import { useSessionStore } from "@/store/useSessionStore";

import { navItems } from "./nav-items";
import { NavBadge } from "./NavBadge";

export function BottomNav() {
  const { t } = useTranslation();
  // Гостю приватная навигация не нужна: за ней всё равно стоит вход.
  const authed = useSessionStore((state) => state.status === "authed");
  const { data: unreadChats = 0 } = useUnreadChatCount(authed);
  // При открытой клавиатуре панель прячем: иначе она всплывает над клавиатурой
  // и перекрывает поле ввода.
  const keyboardOpen = useKeyboardOpen();
  if (!authed || keyboardOpen) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {navItems.map(({ to, params, labelKey, icon: Icon }) => (
          <li key={to} className="min-w-0">
            <Link
              to={to}
              {...(params ? { params } : {})}
              activeProps={{
                className:
                  "text-primary font-semibold before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
              }}
              className="relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] leading-none text-muted-foreground transition-colors"
            >
              <span className="relative">
                <Icon className="size-6" aria-hidden="true" />
                {to === "/chat" ? <NavBadge count={unreadChats} /> : null}
              </span>
              <span className="w-full truncate text-center">{t(labelKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
