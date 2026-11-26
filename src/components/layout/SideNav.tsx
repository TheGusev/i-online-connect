import { WinterWordmark } from "./WinterWordmark";
import { Link } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUnreadChatCount } from "@/features/chat/hooks";
import { useTabOrder } from "@/features/navigation/useTabOrder";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/useSessionStore";

import { navItems } from "./nav-items";

const COLLAPSE_KEY = "ya-online.sidenav-collapsed";

export function SideNav() {
  const { t } = useTranslation();
  // Гостю приватная навигация не нужна: за ней всё равно стоит вход.
  const authed = useSessionStore((state) => state.status === "authed");
  const { data: unreadChats = 0 } = useUnreadChatCount(authed);
  // Порядок общий с нижним меню: пользователь мог его переставить.
  const [tabOrder] = useTabOrder();
  // Свёрнутое меню (только иконки) освобождает место рабочей области; выбор запоминается.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* хранилище недоступно — остаётся развёрнутое меню */
    }
  }, []);
  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* не критично */
      }
      return next;
    });
  if (!authed) return null;
  const orderedItems = tabOrder
    .map((path) => navItems.find((item) => item.to === path))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));
  const linkClass = cn(
    "relative flex items-center rounded-2xl py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
    collapsed ? "justify-center px-0" : "gap-3 px-3",
  );

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r border-border transition-[width] duration-200 lg:block",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div
        className={cn("sticky top-0 flex h-screen flex-col gap-8 py-6", collapsed ? "px-3" : "p-6")}
      >
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {collapsed ? (
            <Link to="/" aria-label={t("app.name")} title={t("app.name")} className="brand-mark">
              Я
            </Link>
          ) : (
            <Link to="/" className="text-lg font-bold tracking-tight">
              <WinterWordmark text={t("app.name")} />
            </Link>
          )}
        </div>
        <nav className="flex flex-col gap-1">
          {orderedItems.map(({ to, params, labelKey, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              {...(params ? { params } : {})}
              aria-label={t(labelKey)}
              title={collapsed ? t(labelKey) : undefined}
              activeProps={{ className: "bg-primary-soft text-primary-ink font-semibold" }}
              className={linkClass}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {collapsed ? null : <span className="flex-1">{t(labelKey)}</span>}
              {to === "/chat" && unreadChats > 0 ? (
                collapsed ? (
                  <span
                    className="absolute right-2 top-1.5 size-2 rounded-full bg-primary shadow-glow"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow-glow">
                    {unreadChats > 99 ? "99+" : unreadChats}
                  </span>
                )
              ) : null}
            </Link>
          ))}
          <Link
            to="/settings"
            aria-label={t("nav.settings")}
            title={collapsed ? t("nav.settings") : undefined}
            activeProps={{ className: "bg-primary-soft text-primary-ink font-semibold" }}
            className={linkClass}
          >
            <Settings className="size-4 shrink-0" aria-hidden="true" />
            {collapsed ? null : t("nav.settings")}
          </Link>
        </nav>
        <div className="mt-auto space-y-3">
          {collapsed ? null : (
            <p className="text-xs leading-relaxed text-muted-foreground">{t("app.tagline")}</p>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className={cn(
              "flex items-center rounded-2xl py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              collapsed ? "w-full justify-center" : "gap-2 px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
            {collapsed ? null : "Свернуть меню"}
          </button>
        </div>
      </div>
    </aside>
  );
}
