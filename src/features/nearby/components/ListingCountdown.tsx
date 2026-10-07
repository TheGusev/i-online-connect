import { useEffect, useState } from "react";

import { ClockTimer } from "@/components/ClockTimer";

/** Минуты до момента; тик по границе минуты. */
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

export function ListingCountdown({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const minutes = useMinutesUntil(expiresAt);
  return <ClockTimer minutes={minutes} {...(className ? { className } : {})} />;
}
