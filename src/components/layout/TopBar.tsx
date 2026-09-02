import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { TrustLevel } from "@/api";
import { Avatar, Button } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

const trustRing: Record<TrustLevel, string> = {
  new: "ring-warning/60",
  verified: "ring-success/60",
  trusted: "ring-success",
  ambassador: "ring-primary",
};

/**
 * Верхняя панель. Гостю не показываем ни аватар, ни колокольчик:
 * пока нет аккаунта — нечему быть «непрочитанным».
 */
export function TopBar({ notifications = 0 }: { notifications?: number }) {
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const status = useSessionStore((state) => state.status);
  const isAuthed = status === "authed" && user !== null;

  const name = user?.name ?? t("app.you");
  const level: TrustLevel = user?.trustLevel ?? "new";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 lg:max-w-5xl lg:px-8">
        <Link to="/" className="text-base font-bold tracking-tight lg:hidden">
          {t("app.name")}
        </Link>
        <span className="hidden text-sm text-muted-foreground lg:block">{t("app.tagline")}</span>

        {isAuthed ? (
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              aria-label={t("app.notifications")}
              className="relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="size-5" aria-hidden="true" />
              {notifications > 0 ? (
                <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {notifications}
                </span>
              ) : null}
            </Link>
            <Link
              to="/profile/me"
              aria-label={t("nav.profile")}
              className={`rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-[1.03] ${trustRing[level]}`}
            >
              <Avatar
                name={name}
                src={user.avatarUrl}
                size="sm"
                verified={level !== "new"}
                online={user.online}
              />
            </Link>
          </div>
        ) : (
          <Button size="sm" asChild>
            <Link to="/onboarding">{t("landing.hero.cta")}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
