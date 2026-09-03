import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Card } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * Компактная карточка-аккордеон профиля.
 *
 * Второстепенные блоки (приватность, верификация, статистика) свёрнуты по
 * умолчанию — это и сокращает скролл, и оставляет всю функциональность на месте.
 */
export function ProfilePanel({
  title,
  description,
  hint,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Короткое значение справа в заголовке — видно и в свёрнутом виде. */
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <Card className={cn("mt-3 overflow-hidden p-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((prev) => !prev)}
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
