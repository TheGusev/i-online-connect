import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function format(msLeft: number) {
  const totalMinutes = Math.max(0, Math.floor(msLeft / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes };
}

/** Таймер до обновления дневной подборки. */
export function RefreshCountdown({ nextRefreshAt }: { nextRefreshAt: string }) {
  const { t } = useTranslation();
  const target = new Date(nextRefreshAt).getTime();
  const [left, setLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setLeft(target - Date.now()), 30000);
    setLeft(target - Date.now());
    return () => window.clearInterval(id);
  }, [target]);

  const { hours, minutes } = format(left);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
      <Clock className="size-3.5" aria-hidden="true" />
      {hours > 0 ? t("feed.refreshInHours", { hours }) : t("feed.refreshInMinutes", { minutes })}
    </span>
  );
}
