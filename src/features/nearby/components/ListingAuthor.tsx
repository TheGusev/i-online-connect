import type { ReactNode } from "react";

import type { Listing } from "@/api";
import { Avatar, TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";
import { cn } from "@/lib/utils";

/**
 * Автор объявления — одинаково во всех местах «Рядом»:
 * аватар 32px, имя 15px, маленький щит доверия. Вариант full — с подписью уровня.
 */
export function ListingAuthor({
  author,
  full = false,
  trailing,
  className,
}: {
  author: Pick<Listing["author"], "name" | "avatarUrl" | "trustLevel">;
  full?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="size-8 shrink-0 overflow-hidden rounded-full [&>*]:!size-8">
        <Avatar name={author.name} src={author.avatarUrl ?? null} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{author.name}</span>
          {full ? null : <TrustBadge level={badgeLevel(author.trustLevel)} size="sm" iconOnly />}
        </span>
        {full ? <TrustBadge level={badgeLevel(author.trustLevel)} size="sm" className="mt-1" /> : null}
      </span>
      {trailing}
    </div>
  );
}
