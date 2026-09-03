import type { ReactNode } from "react";

import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { cn } from "@/lib/utils";

/** Секция личной страницы: много воздуха, спокойная типографика. */
export function ProfileSection({
  title,
  description,
  action,
  children,
  className,
  delay = 0,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal as="section" delay={delay} className={cn("mt-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <WaveHeading className="text-xl font-bold tracking-tight">{title}</WaveHeading>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Reveal>
  );
}
