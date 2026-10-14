import type { NeedCategory } from "@/api";
import { Chip } from "@/components/ds";

import { visibleCategories } from "../labels";

/** Единая чип-группа категорий: используется в фильтрах и в форме. */
export function CategoryChips({
  value,
  onChange,
  allowEmpty = true,
}: {
  value: NeedCategory | null;
  onChange: (next: NeedCategory | null) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {allowEmpty ? (
        <Chip
          selected={value === null}
          onClick={() => onChange(null)}
          size="sm"
          className="min-h-9 shrink-0 whitespace-nowrap px-3 text-xs"
        >
          Все
        </Chip>
      ) : null}

      {visibleCategories.map(({ id, label, icon: Icon }) => (
        <Chip
          key={id}
          size="sm"
          selected={value === id}
          className="min-h-9 shrink-0 whitespace-nowrap px-3 text-xs"
          onClick={() => onChange(allowEmpty && value === id ? null : id)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </Chip>
      ))}
    </div>
  );
}
