import type { NeedCategory } from "@/api";
import { Chip } from "@/components/ds";

import { categories, visibleCategories } from "../labels";
import { selectCategory } from "../category-selection";

/** Единая чип-группа категорий: используется в фильтрах и в форме. */
export function CategoryChips({
  value,
  onChange,
  allowEmpty = true,
  layout = "row",
}: {
  value: NeedCategory | null;
  onChange: (next: NeedCategory | null) => void;
  allowEmpty?: boolean;
  layout?: "row" | "grid";
}) {
  const grid = layout === "grid";
  return (
    <div className={grid ? "grid grid-cols-3 gap-1.5" : "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}>
      {allowEmpty && !grid ? (
        <Chip
          selected={value === null}
          onClick={() => onChange(null)}
          size="sm"
          className="min-h-9 shrink-0 whitespace-nowrap px-3 text-xs"
        >
          Все
        </Chip>
      ) : null}

      {(grid ? categories : visibleCategories).map(({ id, label, icon: Icon }) => (
        <Chip
          key={id}
          size="sm"
          selected={value === id}
          className={grid ? "min-h-9 min-w-0 justify-center px-1.5 text-center text-[10px] leading-tight sm:text-xs" : "min-h-9 shrink-0 whitespace-nowrap px-3 text-xs"}
          onClick={() => onChange(selectCategory(value, id, allowEmpty))}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className={grid ? "min-w-0 break-words" : undefined}>{label}</span>
        </Chip>
      ))}
    </div>
  );
}
