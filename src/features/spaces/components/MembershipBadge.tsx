import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Crown, DoorOpen } from "lucide-react";

/**
 * Компактный статус участия: бейдж вместо двух крупных элементов.
 * Тап открывает маленькое меню с выходом — ссылка не занимает место постоянно.
 */
export function MembershipBadge({
  host,
  pending,
  onLeave,
}: {
  host?: boolean | undefined;
  pending?: boolean | undefined;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (host) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-ink">
        <Crown className="size-3.5" aria-hidden="true" />
        Вы организатор
      </span>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-full bg-community-soft px-3 py-1.5 text-xs font-semibold text-community-ink transition-colors hover:bg-community-soft/80"
      >
        <Check className="size-3.5" aria-hidden="true" />
        Вы участник
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
          <button
            type="button"
            disabled={pending ?? false}
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <DoorOpen className="size-4" aria-hidden="true" />
            Выйти из пространства
          </button>
        </div>
      ) : null}
    </div>
  );
}
