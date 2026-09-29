import { useEffect, useState } from "react";

export function ListingCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const minutes = Math.ceil((Date.parse(expiresAt) - now) / 60_000);
  if (minutes <= 0) return <span>Срок истёк</span>;
  const hours = Math.floor(minutes / 60);
  return <span>Осталось: {hours ? `${hours}ч ${minutes % 60}м` : `${minutes}м`}</span>;
}