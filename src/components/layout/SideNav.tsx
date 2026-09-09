import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUnreadChatCount } from "@/features/chat/hooks";
import { useSessionStore } from "@/store/useSessionStore";

import { navItems } from "./nav-items";

export function SideNav() {
  const { t } = useTranslation();
  // Гостю приватная навигация не нужна: за ней всё равно стоит вход.
  const authed = useSessionStore((state) => state.status === "authed");
  const { data: unreadChats = 0 } = useUnreadChatCount(authed);
  if (!authed) return null;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
      <div className="sticky top-0 flex h-screen flex-col gap-8 p-6">
        <Link to="/" className="text-lg font-bold tracking-tight">
          {t("app.name")}
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, params, labelKey, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              {...(params ? { params } : {})}
              activeProps={{ className: "bg-primary-soft text-accent-foreground font-semibold" }}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="flex-1">{t(labelKey)}</span>
              {to === "/chat" && unreadChats > 0 ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow-glow">
                  {unreadChats > 99 ? "99+" : unreadChats}
                </span>
              ) : null}
            </Link>
          ))}
          <Link
            to="/settings"
            activeProps={{ className: "bg-primary-soft text-accent-foreground font-semibold" }}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Settings className="size-4" aria-hidden="true" />
            {t("nav.settings")}
          </Link>
        </nav>
        <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{t("app.tagline")}</p>
      </div>
    </aside>
  );
}
