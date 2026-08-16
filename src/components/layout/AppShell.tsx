import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";

export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" className="font-semibold">
              {t("app.name")}
            </Link>
            <Link to="/settings" className="text-sm text-muted-foreground">
              {t("nav.settings")}
            </Link>
          </div>
        </header>
        <main
          className={`mx-auto w-full flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-12 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
