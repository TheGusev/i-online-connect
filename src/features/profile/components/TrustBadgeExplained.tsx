import { BadgeCheck, CalendarDays, Coffee, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { TrustDetails, TrustLevel } from "@/api";
import { cn } from "@/lib/utils";

const levelLabel: Record<TrustLevel, string> = {
  new: "Новый участник",
  verified: "Подтверждён по видео",
  trusted: "Проверенный участник",
  ambassador: "Амбассадор доверия",
};

function monthsLabel(months: number) {
  if (months <= 1) return "меньше месяца на платформе";
  if (months < 5) return `${months} месяца на платформе`;
  return `${months} месяцев на платформе`;
}

function meetingsLabel(count: number) {
  if (count === 0) return "пока без офлайн-встреч";
  if (count === 1) return "1 безопасная встреча";
  if (count < 5) return `${count} безопасные встречи`;
  return `${count} безопасных встреч`;
}

/** Бейдж доверия с расшифровкой при наведении или тапе. Без числовых баллов. */
export function TrustBadgeExplained({
  level,
  details,
  className,
}: {
  level: TrustLevel;
  details: TrustDetails;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
          level === "new"
            ? "border-warning/35 bg-warning-soft text-warning-foreground"
            : "border-success/35 bg-success-soft text-foreground",
        )}
      >
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        {levelLabel[level]}
      </button>

      <div
        role="tooltip"
        className={cn(
          "absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-border bg-card p-4 shadow-lift transition-all duration-200",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <p className="text-xs font-semibold text-foreground">Что это значит</p>
        <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2">
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
            {details.videoVerified ? "Подтверждён по видео" : "Видео-верификация не пройдена"}
          </li>
          <li className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {monthsLabel(details.monthsOnPlatform)}
          </li>
          <li className="flex items-start gap-2">
            <Coffee className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {meetingsLabel(details.safeMeetings)}
          </li>
        </ul>
      </div>
    </div>
  );
}
