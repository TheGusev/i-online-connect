/**
 * Каркас админки: боковое меню разделов, таймер короткой сессии, выход.
 *
 * Ничего из этого не попадает в обычный интерфейс: панель монтируется только
 * на скрытом пути (см. src/routes/$.tsx) и только после успешного входа.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { adminApi, adminSessionExpiresAt, clearAdminSession } from "@/api/admin";
import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";

import {
  ActionsSection,
  ListingsSection,
  ReportsSection,
  SpacesSection,
  StatsSection,
  SupportSection,
  UsersSection,
  VerificationsSection,
} from "./sections";

const TABS = [
  { id: "stats", title: "Обзор", render: () => <StatsSection /> },
  { id: "users", title: "Пользователи", render: () => <UsersSection /> },
  { id: "reports", title: "Жалобы", render: () => <ReportsSection /> },
  { id: "verifications", title: "Верификации", render: () => <VerificationsSection /> },
  { id: "listings", title: "Объявления", render: () => <ListingsSection /> },
  { id: "support", title: "Поддержка", render: () => <SupportSection /> },
  { id: "spaces", title: "Сообщества", render: () => <SpacesSection /> },
  { id: "actions", title: "Журнал", render: () => <ActionsSection /> },
] as const;

/** Остаток сессии: админ должен видеть, что вход скоро истечёт. */
function useSessionCountdown(onExpired: () => void) {
  const [left, setLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const expires = adminSessionExpiresAt();
      if (!expires) return;
      const ms = expires - Date.now();
      if (ms <= 0) {
        onExpired();
        return;
      }
      const minutes = Math.floor(ms / 60000);
      setLeft(`${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`);
    };
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, [onExpired]);

  return left;
}

export function AdminPanel({ onSignedOut }: { onSignedOut: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("stats");

  const signOut = () => {
    clearAdminSession();
    onSignedOut();
  };

  const left = useSessionCountdown(signOut);

  // Проверяем, жив ли токен: истёк — сразу возвращаемся к форме входа.
  const { data: session, isError } = useQuery({
    queryKey: ["admin", "session"],
    queryFn: () => adminApi.session(),
    retry: false,
  });

  useEffect(() => {
    if (isError) signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
        <span className="text-sm font-bold text-foreground">Админка «Я Онлайн»</span>
        <span className="text-[11px] text-muted-foreground">{session?.email ?? ""}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {left ? `сессия: ${left}` : ""}
        </span>
        <Button size="sm" variant="secondary" onClick={signOut}>
          Выйти
        </Button>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-4 px-3 py-4">
        <nav className="hidden w-44 shrink-0 lg:block">
          <ul className="space-y-1">
            {TABS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    item.id === tab
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* На узком экране меню превращается в горизонтальную полосу вкладок. */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex gap-1 overflow-x-auto lg:hidden">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs",
                  item.id === tab
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {item.title}
              </button>
            ))}
          </div>
          {active.render()}
        </div>
      </div>
    </div>
  );
}
