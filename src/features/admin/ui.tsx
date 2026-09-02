/**
 * Мелкие строительные блоки админки: плотная таблица, панель фильтров,
 * плитка показателя, пагинация.
 *
 * Про XSS: всё выводится как текст через JSX ({value}) — React экранирует
 * подстановки сам. dangerouslySetInnerHTML в админке не используется нигде:
 * данные здесь приходят от пользователей (жалобы, объявления, обращения)
 * и считаются недоверенными.
 */
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";

/** Ввод в фильтрах не должен дёргать API на каждую букву. */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SectionHeader({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            {head.map((title) => (
              <th
                key={title}
                className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-border/60 last:border-0 align-top">{children}</tr>;
}

export function Cell({
  children,
  className,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cn("px-3 py-2", className)} {...(colSpan ? { colSpan } : {})}>
      {children}
    </td>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const tones = {
    neutral: "bg-secondary text-secondary-foreground",
    good: "bg-success/15 text-success",
    warn: "bg-warning/20 text-warning-foreground",
    bad: "bg-destructive/12 text-destructive",
  } as const;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Pager({
  page,
  total,
  limit,
  onChange,
  busy,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Всего: {total} · страница {page} из {pages}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1 || busy}
          onClick={() => onChange(page - 1)}
        >
          Назад
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= pages || busy}
          onClick={() => onChange(page + 1)}
        >
          Вперёд
        </Button>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, text = "Ничего не найдено" }: { colSpan: number; text?: string }) {
  return (
    <Row>
      <Cell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
        {text}
      </Cell>
    </Row>
  );
}

/** Дата в компактном виде: в таблицах важна плотность. */
export function shortDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
