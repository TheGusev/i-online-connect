import { cn } from "@/lib/utils";

export type SpacesTab = "nearby" | "interests" | "mine" | "create";

const tabs: { id: SpacesTab; label: string; short?: string }[] = [
  { id: "nearby", label: "Рядом" },
  { id: "interests", label: "По интересам" },
  { id: "mine", label: "Мои" },
  { id: "create", label: "Создать своё", short: "+ Своё" },
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
      className="grid w-full grid-cols-[auto_minmax(0,1.6fr)_auto_minmax(0,1.2fr)] gap-0.5 rounded-2xl border border-border bg-card p-1 shadow-soft min-[380px]:grid-cols-4"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-label={tab.label}
            onClick={() => onChange(tab.id)}
            className={cn(
              "min-w-0 whitespace-nowrap rounded-xl px-2 py-1.5 text-[12px] font-bold uppercase tracking-tight transition-colors duration-200",
              active
                ? "bg-community text-community-foreground shadow-glow"
                : "text-muted-foreground hover:bg-community-soft hover:text-community-ink",
            )}
          >
            {tab.short ? (
              <>
                <span className="min-[380px]:hidden">{tab.short}</span>
                <span className="hidden min-[380px]:inline">{tab.label}</span>
              </>
            ) : (
              tab.label
            )}
          </button>
        );
      })}
    </div>
  );
}
