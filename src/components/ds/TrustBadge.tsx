import { BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type TrustLevel = "new" | "confirmed" | "trusted";

const config: Record<
  TrustLevel,
  { label: string; className: string; icon: typeof Sparkles }
> = {
  new: {
    label: "Новый",
    className: "bg-warning-soft text-warning-foreground border-warning/30",
    icon: Sparkles,
  },
  confirmed: {
    label: "Подтверждён",
    className: "bg-success-soft text-foreground border-success/35",
    icon: BadgeCheck,
  },
  trusted: {
    label: "Проверенный участник",
    className: "bg-gradient-verified text-primary-foreground border-transparent",
    icon: ShieldCheck,
  },
};

export interface TrustBadgeProps {
  level: TrustLevel;
  size?: "sm" | "md";
  className?: string;
}

export function TrustBadge({ level, size = "md", className }: TrustBadgeProps) {
  const { label, className: tone, icon: Icon } = config[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        tone,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden="true" />
      {label}
    </span>
  );
}
