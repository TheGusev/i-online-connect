import { MessageSquareQuote } from "lucide-react";

/** Подсказки первой фразы от AI: тап вставляет текст в поле ввода. */
export function StarterChips({
  starters,
  loading,
  onPick,
}: {
  starters: string[];
  loading: boolean;
  onPick: (text: string) => void;
}) {
  if (!loading && starters.length === 0) return null;

  return (
    <div className="border-t border-border bg-primary-soft/35 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MessageSquareQuote className="size-3.5" aria-hidden="true" />
        AI предлагает начать так — можно поправить перед отправкой
      </p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Подбираем варианты…</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onPick(starter)}
              className="shrink-0 max-w-72 truncate rounded-full border border-primary/25 bg-card px-4 py-2 text-left text-xs text-foreground shadow-soft transition-colors hover:border-primary/60 hover:bg-secondary"
            >
              {starter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
