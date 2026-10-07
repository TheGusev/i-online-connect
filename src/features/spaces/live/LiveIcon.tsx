import { cn } from "@/lib/utils";

/** Знак эфира: при активном эфире дуги вспыхивают волной, точка пульсирует. */
export function LiveIcon({ active, className }: { active: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={cn("live-icon", active && "live-icon--on", className)}
    >
      <circle className="live-icon__dot" cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path className="live-icon__arc live-icon__arc--1" d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" />
      <path className="live-icon__arc live-icon__arc--2" d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </svg>
  );
}
