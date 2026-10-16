import { cn } from "@/lib/utils";

/** Компактный чип реакции для нижней строки сообщения: эмодзи 14px, число 12px. */
export function ReactionChip({ emoji, mine, overlay = false }: { emoji: string; mine: boolean; overlay?: boolean }) {
  return (
    <span
      className={cn(
        "reaction-pop inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 ring-1",
        overlay
          ? "bg-background/60 ring-primary/60 backdrop-blur-sm text-foreground"
          : mine
            ? "bg-primary-foreground/20 ring-primary-foreground/60"
            : "bg-primary/15 ring-primary",
      )}
      aria-label={`Ваша реакция ${emoji}`}
    >
      <span className="text-[14px] leading-none">{emoji}</span>
      <span className="text-[12px] font-semibold leading-none">1</span>
    </span>
  );
}
