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
      className="-mx-1 flex gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 shadow-soft"
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
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200",
              active
                ? "bg-community text-community-foreground"
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
