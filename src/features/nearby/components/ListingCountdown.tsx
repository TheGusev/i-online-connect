import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Электронные часы ЧЧ:ММ до истечения; тик по границе минуты. */
export function ListingCountdown({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);

  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const expired = minutes <= 0;
  const urgent = !expired && minutes < 15;
  const warm = !expired && minutes < 60;

  return (
    <span
      aria-label={expired ? "Срок истёк" : `Осталось ${hh}:${mm}`}
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
      <span className={cn(warm && "motion-safe:animate-[blink_1s_steps(1)_infinite]")}>:</span>
      {mm}
    </span>
  );
}
