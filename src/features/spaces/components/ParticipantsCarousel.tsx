import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import type { SpaceMember } from "@/api";
import { Avatar } from "@/components/ds";
import { cn } from "@/lib/utils";
import { formatMembers } from "@/features/spaces/labels";

/**
 * Ряд участников с выбором в духе карточек ленты.
 *
 * Первый тап делает аватар активным (увеличивается — лицо видно чётче),
 * повторный тап по уже активному открывает анкету. Свайп листает ряд.
 * Компонент переиспользуемый: подходит и для участников отдельной встречи.
 */
export function ParticipantsCarousel({
  members,
  total,
  hostName,
  className,
}: {
  members: SpaceMember[];
  total?: number | undefined;
  hostName?: string | undefined;
  className?: string | undefined;
}) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const railRef = useRef<HTMLUListElement | null>(null);

  if (members.length === 0) return null;

  const count = total ?? members.length;
  const rest = Math.max(0, count - members.length);
  const active = members.find((member) => member.id === activeId) ?? null;

  const handleTap = (member: SpaceMember) => {
    if (member.id === activeId) {
      void navigate({ to: "/profile/$id", params: { id: member.id } });
      return;
    }
    setActiveId(member.id);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <ul
        ref={railRef}
        className="flex snap-x snap-mandatory items-center gap-3 overflow-x-auto pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {members.map((member) => {
          const isActive = member.id === activeId;
          return (
            <li key={member.id} className="shrink-0 snap-center">
              <button
                type="button"
                onClick={() => handleTap(member)}
                aria-pressed={isActive}
                aria-label={
                  isActive ? `Открыть анкету: ${member.name}` : `Выбрать участника: ${member.name}`
                }
                className={cn(
                  "grid place-items-center rounded-full transition-transform duration-200",
                  isActive ? "scale-110" : "scale-95 opacity-80 hover:opacity-100",
                )}
              >
                <span
                  className={cn(
                    "rounded-full ring-2 transition-shadow duration-200",
                    isActive ? "ring-primary shadow-glow" : "ring-border",
                  )}
                >
                  <Avatar
                    name={member.name}
                    src={member.avatarUrl ?? null}
                    size={isActive ? "lg" : "md"}
                  />
                </span>
              </button>
            </li>
          );
        })}

        {rest > 0 ? (
          <li className="shrink-0 snap-center">
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground ring-2 ring-border">
              +{rest}
            </span>
          </li>
        ) : null}
      </ul>

      <p className="mt-1 text-xs text-muted-foreground">
        {active ? (
          <>
            <span className="font-semibold text-foreground">{active.name}</span>
            {active.host ? " · организатор" : ""} — нажмите ещё раз, чтобы открыть анкету
          </>
        ) : (
          <>
            {formatMembers(count)}
            {hostName ? ` · организует ${hostName}` : ""} — нажмите на аватар
          </>
        )}
      </p>
    </div>
  );
}
