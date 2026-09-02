import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSessionStore } from "@/store/useSessionStore";

import { navItems } from "./nav-items";

export function SideNav() {
  const { t } = useTranslation();
  // Гостю приватная навигация не нужна: за ней всё равно стоит вход.
  const authed = useSessionStore((state) => state.status === "authed");
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
              {t(labelKey)}
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
