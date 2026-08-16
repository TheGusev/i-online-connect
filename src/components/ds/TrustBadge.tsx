import { BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export type TrustLevel = "new" | "confirmed" | "trusted";

interface LevelConfig {
  label: string;
  className: string;
  icon: typeof Sparkles;
  /** Что значит уровень — тёплым, человеческим языком. */
  meaning: string;
  /** Как получить следующий уровень; null — уровень уже высший. */
  next: string | null;
}

export const trustLevelConfig: Record<TrustLevel, LevelConfig> = {
  new: {
    label: "Новый участник",
    className: "bg-warning-soft text-warning-foreground border-warning/30",
    icon: Sparkles,
    meaning:
      "Профиль создан, но видео-верификация ещё не пройдена. Пока это значит только одно: человек здесь недавно.",
    next: "Чтобы стать «Подтверждён» — пройди видео-верификацию, это 10 секунд записи в приложении.",
  },
  confirmed: {
    label: "Подтверждён",
    className: "bg-success-soft text-foreground border-success/35",
    icon: BadgeCheck,
    meaning:
      "Мы сверили живое селфи с фото в профиле — за этой анкетой точно настоящий человек, а не чужие снимки.",
    next: "Уровень «Проверенный участник» приходит сам: месяц спокойного общения без жалоб и первые встречи офлайн.",
  },
  trusted: {
    label: "Проверенный участник",
    className: "bg-gradient-verified text-primary-foreground border-transparent",
    icon: ShieldCheck,
    meaning:
      "Верификация пройдена, человек давно на платформе, диалоги заканчивались спокойно и без жалоб.",
    next: null,
  },
};

export interface TrustBadgeProps {
  level: TrustLevel;
  size?: "sm" | "md";
  className?: string;
  /** Тултип с расшифровкой по наведению и тапу. */
  withTooltip?: boolean;
  /** Сторона, куда раскрывается тултип. */
  align?: "left" | "right";
}

export function TrustBadge({
  level,
  size = "md",
  className,
  withTooltip = false,
  align = "left",
}: TrustBadgeProps) {
  const { label, className: tone, icon: Icon, meaning, next } = trustLevelConfig[level];
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  const badgeClass = cn(
    "inline-flex items-center gap-1.5 rounded-full border font-semibold",
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
    tone,
    className,
  );
  const iconClass = size === "sm" ? "size-3" : "size-3.5";

  if (!withTooltip) {
    return (
      <span className={badgeClass}>
        <Icon className={iconClass} aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={tooltipId}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(badgeClass, "cursor-help transition-transform active:scale-[0.98]")}
      >
        <Icon className={iconClass} aria-hidden="true" />
        {label}
      </button>

      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "absolute top-full z-30 mt-2 block w-72 rounded-2xl border border-border bg-card p-4 text-left shadow-lift transition-all duration-200",
          align === "right" ? "right-0" : "left-0",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <span className="block text-xs font-bold text-foreground">{label}</span>
        <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
          {meaning}
        </span>
        <span
          className={cn(
            "mt-3 block rounded-xl px-3 py-2 text-xs leading-relaxed",
            next ? "bg-secondary text-secondary-foreground" : "bg-success-soft text-foreground",
          )}
        >
          {next ?? "Это высший уровень доверия — спасибо, что делаешь платформу спокойнее."}
        </span>
      </span>
    </span>
  );
}
