import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Блок правой панели на ПК: подпись раздела и содержимое. */
export function RailSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="hud-label">{title}</h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

export function RailEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
