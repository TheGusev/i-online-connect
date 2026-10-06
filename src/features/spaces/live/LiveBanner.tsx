import { mediaUrl } from "@/api";
import { Avatar, Button } from "@/components/ds";
import { cn } from "@/lib/utils";

import { ClipBricks } from "./ClipBricks";
import type { LiveRoom } from "./useLiveRoom";

export function LiveBanner({ room, onEnter }: { room: LiveRoom; onEnter: () => void }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300",
        room.active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!room.active}
    >
      <div className="overflow-hidden">
        <div className="mt-2 flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 py-1 pl-3 pr-1">
          <span className="live-dot" />
          <span className="shrink-0 text-xs font-semibold text-primary-ink">В эфире · {room.participants.length}</span>
          <div className="flex -space-x-1.5">
            {room.participants.slice(0, 3).map((p) => (
              <Avatar key={p.userId} name={p.name} src={mediaUrl(p.avatarUrl) ?? null} size="xs" className="border border-background" />
            ))}
          </div>
          <div className="min-w-0 flex-1"><ClipBricks mini clips={room.clips} participants={room.participants} /></div>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={onEnter} tabIndex={room.active ? 0 : -1}>Войти</Button>
        </div>
      </div>
    </div>
  );
}
