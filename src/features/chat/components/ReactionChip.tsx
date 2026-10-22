import type { MessageReaction } from "@/api";
import { cn } from "@/lib/utils";

import { LiveEmoji } from "./LiveEmoji";

/** Компактный чип реакции для нижней строки сообщения: эмодзи 14px, число 12px; мои подсвечены. */
export function ReactionChip({ emoji, count, mine, onBubble = false, overlay = false }: { emoji: string; count: number; mine: boolean; onBubble?: boolean; overlay?: boolean }) {
  return (
    <span
      className={cn(
        "reaction-pop inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 ring-1",
        overlay
          ? cn("bg-background/60 backdrop-blur-sm text-foreground", mine ? "ring-primary" : "ring-border")
          : onBubble
            ? mine ? "bg-primary-foreground/25 ring-primary-foreground/70" : "bg-primary-foreground/10 ring-primary-foreground/30"
            : mine ? "bg-primary/20 ring-primary" : "bg-muted/60 ring-border",
      )}
      aria-label={mine ? `Ваша реакция ${emoji}, всего ${count}` : `Реакция ${emoji}, всего ${count}`}
    >
      <LiveEmoji symbol={emoji} seed={`${emoji}:${count}`} className="text-[14px] leading-none" />
      <span className="text-[12px] font-semibold leading-none">{count}</span>
    </span>
  );
}

/** Все реакции сообщения в одну строку. */
export function ReactionChips({ reactions, onBubble, overlay }: { reactions: MessageReaction[] | undefined; onBubble?: boolean; overlay?: boolean }) {
  if (!reactions?.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {reactions.map((r) => <ReactionChip key={r.emoji} emoji={r.emoji} count={r.count} mine={r.mine} {...(onBubble ? { onBubble } : {})} {...(overlay ? { overlay } : {})} />)}
    </span>
  );
}
