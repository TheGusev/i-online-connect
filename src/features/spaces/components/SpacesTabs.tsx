import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";

export type SpacesTab = "nearby" | "interests" | "mine" | "create";

const tabs: { id: SpacesTab; label: string }[] = [
  { id: "nearby", label: "Рядом" },
  { id: "interests", label: "Интересы" },
  { id: "mine", label: "Мои" },
  { id: "create", label: "Создать" },
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
          <Button
            key={tab.id}
            variant="ghost"
            role="tab"
            type="button"
            aria-selected={active}
            aria-label={tab.label}
            onClick={() => onChange(tab.id)}
            className={cn(
              "h-auto min-w-0 overflow-hidden rounded-xl px-1 py-2 text-center text-[10px] font-bold uppercase leading-none tracking-normal shadow-none transition-colors duration-200 min-[380px]:text-xs",
              active
                ? "bg-community text-community-foreground shadow-glow"
                : "text-muted-foreground hover:bg-community-soft hover:text-community-ink",
            )}
          >
            <span className="block truncate">{tab.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
