import type { ReactNode } from "react";

import { RequireSession } from "@/features/auth/session";
import { useViewportHeightVar } from "@/hooks/useViewportHeight";
import { useScreenSwipe } from "@/features/navigation/useScreenSwipe";
import { useTabOrder } from "@/features/navigation/useTabOrder";
import { useTranslation } from "react-i18next";
import { navItems } from "./nav-items";



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
  focused = false,
}: {
  children: ReactNode;
  wide?: boolean;
  public?: boolean;
  focused?: boolean;
}) {
  // Держит --app-height/--keyboard-inset актуальными на каждом экране.
  useViewportHeightVar();
  const { t } = useTranslation();
  // Свайпы экранов — только на телефоне/планшете; на компьютере есть боковое меню.
  const { surfaceRef, peek, enterClass, optimisticTab } = useScreenSwipe(true);
  const [tabOrder] = useTabOrder();
  const peekItem = peek ? navItems.find((item) => item.to === tabOrder[peek.index]) : undefined;
  const content = (
    <div className="app-viewport flex bg-background text-foreground">
      <SideNav />
      {peekItem ? (
        <div className="swipe-peek lg:hidden" aria-hidden="true" style={{ [peek!.side === "right" ? "left" : "right"]: 0 }}>
          <div className="flex flex-col items-center gap-2">
            <peekItem.icon className="size-8 text-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.14em]">{t(peekItem.labelKey)}</span>
          </div>
        </div>
      ) : null}
      <div ref={surfaceRef} className={`swipe-surface relative z-10 flex min-w-0 flex-1 flex-col bg-background ${enterClass}`}>
        {!focused ? <TopBar /> : null}
        <main
          className={`mx-auto w-full flex-1 px-4 ${focused ? "pb-[env(safe-area-inset-bottom)] pt-3" : "pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-6 lg:pb-12"} lg:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
        >
          {children}
        </main>
      </div>

      {!focused ? <BottomNav activeOverride={optimisticTab === null ? undefined : tabOrder[optimisticTab]} /> : null}
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
