import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { Card } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * Компактная карточка-аккордеон профиля.
 *
 * Второстепенные блоки (приватность, верификация, статистика) свёрнуты по
 * умолчанию — это и сокращает скролл, и оставляет всю функциональность на месте.
 * Если передан `storageKey`, состояние блока запоминается в браузере: читаем его
 * уже после гидратации, чтобы разметка сервера и клиента совпадала.
 */
export function ProfilePanel({
  title,
  description,
  hint,
  defaultOpen = false,
  storageKey,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Короткое значение справа в заголовке — видно и в свёрнутом виде. */
  hint?: ReactNode;
  defaultOpen?: boolean;
  /** Ключ для запоминания открытости блока между визитами. */
  storageKey?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(`profile-panel:${storageKey}`);
      if (stored === "open") setOpen(true);
      if (stored === "closed") setOpen(false);
    } catch {
      // приватный режим браузера — просто оставляем значение по умолчанию
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          window.localStorage.setItem(`profile-panel:${storageKey}`, next ? "open" : "closed");
        } catch {
          // ничего не делаем: запоминание — приятный бонус, а не требование
        }
      }
      return next;
    });
  };

  return (
    <Card className={cn("mt-3 overflow-hidden p-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{title}</span>
          {description ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {!open && hint ? <span className="max-w-[9rem] truncate">{hint}</span> : null}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? (
        <div id={id} className="border-t border-border px-4 pb-4 pt-4">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
