import type { SpaceMember } from "@/api";
import { Avatar } from "@/components/ds";
import { formatMembers } from "@/features/spaces/labels";

/**
 * Компактная полоса участников: сообщество, а не ещё одна лента анкет,
 * поэтому карточек и переходов в профили здесь намеренно нет.
 */
export function MemberStrip({
  members,
  total,
  hostName,
}: {
  members: SpaceMember[];
  total: number;
  hostName: string;
}) {
  const shown = members.slice(0, 7);
  const rest = Math.max(0, total - shown.length);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center">
        {shown.map((member, index) => (
          <span
            key={member.id}
            title={member.name}
            className="-ml-2 first:ml-0 rounded-full ring-2 ring-card"
            style={{ zIndex: shown.length - index }}
          >
            <Avatar name={member.name} src={member.avatarUrl ?? null} size="sm" />
          </span>
        ))}
        {rest > 0 ? (
          <span className="-ml-2 grid size-9 place-items-center rounded-full bg-community-soft text-xs font-semibold text-community-ink ring-2 ring-card">
            +{rest}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {formatMembers(total)} · организует {hostName}
      </p>
    </div>
  );
}
