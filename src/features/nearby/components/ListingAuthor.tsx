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
      <Avatar name={author.name} src={author.avatarUrl ?? null} size={full ? "sm" : "list"} trust={getTrustLevel(author)} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{author.name}</span>
        </span>
        {full && trustRingLabel[getTrustLevel(author)] ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{trustRingLabel[getTrustLevel(author)]}</span>
        ) : null}
      </span>
      {trailing}
    </div>
  );
}
