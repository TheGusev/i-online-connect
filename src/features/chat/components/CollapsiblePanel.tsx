import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Панель плавно сжимается к краю и отдаёт место ленте; скрытая не получает фокус. */
export function CollapsiblePanel({
  hidden,
  edge,
  className,
  children,
}: {
  hidden: boolean;
  edge: "top" | "bottom";
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        hidden ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      )}
      aria-hidden={hidden || undefined}
      inert={hidden}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden transition-transform duration-300 ease-out motion-reduce:transition-none",
          edge === "top" ? "origin-top" : "origin-bottom",
          hidden && "scale-95",
        )}
      >
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
