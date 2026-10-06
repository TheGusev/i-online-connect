import { cn } from "@/lib/utils";

import { authorColor, type LiveClip, type LiveParticipant } from "./useLiveRoom";

/** Шкала-кирпичи: ширина по длительности, старые сжимаются в тонкие полоски. */
export function ClipBricks({
  clips,
  participants,
  activeId,
  onPick,
  mini = false,
}: {
  clips: LiveClip[];
  participants: LiveParticipant[];
  activeId?: string | null;
  onPick?: (clip: LiveClip) => void;
  mini?: boolean;
}) {
  const visible = mini ? clips.slice(-8) : clips;
  const fresh = mini ? 8 : 14;
  return (
    <div className={cn("flex items-stretch gap-0.5 overflow-hidden", mini ? "h-3 w-16" : "h-6 w-full")}>
      {visible.map((clip, i) => {
        const old = visible.length - i > fresh;
        const grow = old ? 0 : clip.durationMs / 1000;
        return (
          <button
            key={clip.id}
            type="button"
            disabled={!onPick}
            aria-label="Проиграть клип"
            onClick={() => onPick?.(clip)}
            className={cn(
              "rounded-sm transition-[opacity,box-shadow] duration-300",
              old ? "w-0.5 shrink-0 opacity-40" : "min-w-1 opacity-85",
              activeId === clip.id && "opacity-100 shadow-glow",
            )}
            style={{ flexGrow: grow, backgroundColor: authorColor(clip.userId, participants) }}
          />
        );
      })}
    </div>
  );
}
