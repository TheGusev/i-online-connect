import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { navItems } from "./nav-items";

export function SideNav() {
  const { t } = useTranslation();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border lg:block">
      <div className="sticky top-0 flex h-screen flex-col gap-6 p-6">
        <Link to="/" className="text-lg font-semibold">
          {t("app.name")}
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, labelKey, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(labelKey)}
            </Link>
          ))}
        </nav>
        <p className="mt-auto text-xs text-muted-foreground">{t("app.tagline")}</p>
      </div>
    </aside>
  );
}
