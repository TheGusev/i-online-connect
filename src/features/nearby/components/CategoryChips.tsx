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
    <div className="flex flex-wrap gap-2">
      {allowEmpty ? (
        <Chip selected={value === null} onClick={() => onChange(null)} size="sm">
          Все
        </Chip>
      ) : null}
      {categories.map(({ id, label, icon: Icon }) => (
        <Chip
          key={id}
          size="sm"
          selected={value === id}
          onClick={() => onChange(allowEmpty && value === id ? null : id)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </Chip>
      ))}
    </div>
  );
}
