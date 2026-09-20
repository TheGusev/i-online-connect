import type { NeedCategory } from "@/api";
import { Chip } from "@/components/ds";

import { categories } from "../labels";

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
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {allowEmpty ? (
        <Chip
          selected={value === null}
          onClick={() => onChange(null)}
          size="sm"
          className="min-h-9 min-w-0 justify-center px-1.5 text-center text-[10px] leading-tight sm:text-xs"
        >
          Все
        </Chip>
      ) : null}

      {categories.map(({ id, label, icon: Icon }) => (
        <Chip
          key={id}
          size="sm"
          selected={value === id}
          className="min-h-9 min-w-0 justify-center px-1.5 text-center text-[10px] leading-tight sm:text-xs"
          onClick={() => onChange(allowEmpty && value === id ? null : id)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </Chip>
      ))}
    </div>
  );
}
