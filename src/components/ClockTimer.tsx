import { cn } from "@/lib/utils";

/** Электронные часы ЧЧ:ММ. Двоеточие моргает только через CSS (.clock-colon). */
export function ClockTimer({
  minutes,
  className,
  label,
}: {
  minutes: number;
  className?: string;
  label?: string;
}) {
  const safe = Math.max(0, minutes);
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  const expired = safe <= 0;
  const urgent = !expired && safe < 15;
  const warm = !expired && safe < 60;

  return (
    <span
      aria-label={label ?? (expired ? "Срок истёк" : `Осталось ${hh}:${mm}`)}
      className={cn(
        "font-mono text-base font-bold leading-none tabular-nums",
        expired
          ? "text-muted-foreground opacity-70"
          : urgent
            ? "text-destructive [text-shadow:0_0_8px_var(--color-destructive)]"
            : warm
              ? "text-accent [text-shadow:0_0_8px_var(--color-accent)]"
              : "text-primary [text-shadow:0_0_8px_var(--color-primary)]",
        className,
      )}
    >
      {hh}
      <span className={cn(!expired && "clock-colon")} aria-hidden="true">:</span>
      {mm}
    </span>
  );
}
