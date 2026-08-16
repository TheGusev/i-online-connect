import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface SettingsSectionMeta {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Навигация по настройкам: боковое меню на десктопе, табы на мобильном. */
export function SettingsNav({
  sections,
  active,
  onSelect,
}: {
  sections: SettingsSectionMeta[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <nav
        aria-label="Разделы настроек"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={active === section.id ? "true" : undefined}
            onClick={() => onSelect(section.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active === section.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <nav aria-label="Разделы настроек" className="hidden lg:block">
        <ul className="sticky top-6 space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = active === section.id;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onSelect(section.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {section.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
