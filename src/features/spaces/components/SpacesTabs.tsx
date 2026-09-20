import { cn } from "@/lib/utils";

export type SpacesTab = "nearby" | "interests" | "mine" | "create";

const tabs: { id: SpacesTab; label: string }[] = [
  { id: "nearby", label: "Рядом" },
  { id: "interests", label: "По интересам" },
  { id: "mine", label: "Мои" },
  { id: "create", label: "Создать своё" },
];

export function SpacesTabs({
  value,
  onChange,
}: {
  value: SpacesTab;
  onChange: (tab: SpacesTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Разделы пространств"
      className="grid w-full grid-cols-4 gap-1 rounded-2xl border border-border bg-card p-1 shadow-soft"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "min-w-0 rounded-xl px-1 py-2 text-[10px] font-bold uppercase transition-colors duration-200 sm:px-3 sm:text-xs",
              active
                ? "bg-community text-community-foreground shadow-glow"
                : "text-muted-foreground hover:bg-community-soft hover:text-community-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
