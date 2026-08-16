import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { navItems } from "./nav-items";

export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background lg:hidden">
      <ul className="grid grid-cols-5">
        {navItems.map(({ to, labelKey, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "text-foreground" }}
              className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground"
            >
              <Icon className="size-5" aria-hidden="true" />
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
