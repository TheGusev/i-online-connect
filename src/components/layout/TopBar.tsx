import { WinterWordmark } from "./WinterWordmark";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { TrustLevel } from "@/api";
import { presenceApi } from "@/api";
import { Avatar, Button } from "@/components/ds";
import { NotificationsBell } from "@/features/notifications/components/NotificationsBell";
import { useSessionStore } from "@/store/useSessionStore";
import { cityCode } from "@/lib/cityCode";

/**
 * Верхняя панель. Гостю не показываем ни аватар, ни колокольчик:
 * пока нет аккаунта — нечему быть «непрочитанным».
 */
export function TopBar() {
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const status = useSessionStore((state) => state.status);
  const isAuthed = status === "authed" && user !== null;

  const name = user?.name ?? t("app.you");
  const level: TrustLevel = user?.trustLevel ?? "new";

  // Счётчик онлайна: обычный поллинг раз в 45 секунд, без отдельного WS-канала.
  const presence = useQuery({
    queryKey: ["presence", "summary"],
    queryFn: presenceApi.getPresenceSummary,
    enabled: isAuthed,
    refetchInterval: 45_000,
    staleTime: 30_000,
  });

  const counters = presence.data;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 lg:max-w-5xl lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/" className="text-base font-bold tracking-tight lg:hidden">
            <WinterWordmark text={t("app.name")} />
          </Link>
          <span className="hidden text-sm text-muted-foreground lg:block">{t("app.tagline")}</span>

          {isAuthed && counters && counters.total > 0 && (
            <span
              className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
              aria-label={`В сети: ${counters.total}${counters.cityName ? `, в городе ${counters.cityName}: ${counters.city}` : ""}`}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
              {counters.cityName ? (
                <>
                  <span title={counters.cityName} className="max-w-[5.5rem] truncate font-semibold uppercase tracking-wider">{cityCode(counters.cityName)}</span>
                  <span key={counters.city} className="count-tick text-primary">{counters.city}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span>всего</span>
              <span key={counters.total} className="count-tick text-primary">{counters.total}</span>
            </span>
          )}
        </div>

        {isAuthed ? (
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <Link
              to="/profile/me"
              aria-label={t("nav.profile")}
              className="avatar-ring"
              data-trust={level}
            >
              <Avatar
                name={name}
                src={user.avatarUrl ?? null}
                size="sm"
                verified={level !== "new"}
              />
            </Link>
          </div>
        ) : (
          <Button size="sm" asChild>
            <Link to="/auth">Войти</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
