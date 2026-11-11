import type { ReactNode, RefObject } from "react";

import { cn } from "@/lib/utils";

/** Панель-«стекло» поверх ленты. Прячется через transform (его пишет useReadingMode), раскладка не меняется. */
export function FloatingPanel({
  edge,
  panelRef,
  className,
  children,
}: {
  edge: "top" | "bottom";
  panelRef: RefObject<HTMLDivElement | null>;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      ref={panelRef}
      className={cn("absolute inset-x-0 z-20", edge === "top" ? "top-0 origin-top" : "bottom-0 origin-bottom")}
    >
      <div className={className}>{children}</div>
    </div>
  );
}
