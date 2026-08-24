import type { ReactNode } from "react";

import { RequireSession } from "@/features/auth/session";

import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

/**
 * Каркас приватных экранов. Без активной сессии уводит на /auth —
 * так после регистрации и при возврате в приложение не видно лендинга.
 * public=true — для экранов, доступных гостям (например, гайды безопасности).
 */
export function AppShell({
  children,
  wide = false,
  public: isPublic = false,
}: {
  children: ReactNode;
  wide?: boolean;
  public?: boolean;
}) {
  const content = (
    <div className="flex min-h-dvh bg-background text-foreground">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          className={`mx-auto w-full flex-1 px-4 pb-28 pt-6 lg:px-8 lg:pb-12 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );

  return isPublic ? content : <RequireSession>{content}</RequireSession>;
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
