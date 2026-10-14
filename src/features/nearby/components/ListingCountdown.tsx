import { useEffect, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { formatRemaining } from "../countdown";

/** Минуты до момента; тик по границе минуты (используется карточками сообществ). */
export function useMinutesUntil(at: string) {
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
  return Math.max(0, Math.ceil((Date.parse(at) - now) / 60_000));
}

// Один общий секундный тик на весь экран: все таймеры обновляются вместе.
const listeners = new Set<() => void>();
let nowValue = Date.now();
let interval: number | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (interval === null && typeof window !== "undefined") {
    nowValue = Date.now();
    interval = window.setInterval(() => {
      nowValue = Date.now();
      listeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      window.clearInterval(interval);
      interval = null;
    }
  };
}

export function useNow() {
  return useSyncExternalStore(subscribe, () => nowValue, () => 0);
}

export function ListingCountdown({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const now = useNow();
  if (now === 0) return null;
  const r = formatRemaining(expiresAt, now);
  const urgent = r.kind === "minutes" && r.ms < 15 * 60_000;
  const warm = r.kind === "minutes" || (r.kind === "hours" && r.ms < 3 * 3_600_000);

  return (
    <span
      aria-label={r.kind === "expired" ? "Срок истёк" : `Осталось ${r.text}`}
      className={cn(
        "inline-flex shrink-0 items-baseline justify-end whitespace-nowrap font-mono text-sm font-bold leading-none tabular-nums",
        r.kind === "expired"
          ? "text-muted-foreground opacity-70"
          : urgent
            ? "text-destructive [text-shadow:0_0_8px_var(--color-destructive)]"
            : warm
              ? "text-accent [text-shadow:0_0_8px_var(--color-accent)]"
              : "text-primary [text-shadow:0_0_8px_var(--color-primary)]",
        className,
      )}
    >
      {r.kind === "expired" ? (
        "Истекло"
      ) : r.kind === "days" ? (
        r.text
      ) : (
        <>
          {r.left}
          <span className="clock-colon" aria-hidden="true">:</span>
          {r.right}
        </>
      )}
    </span>
  );
}
