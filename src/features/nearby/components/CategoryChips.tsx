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
    // На мобильном чипы едут в одну строку с прокруткой (девять категорий
    // переносом заняли бы половину экрана), с sm: — обычный перенос.
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {allowEmpty ? (
        <Chip
          selected={value === null}
          onClick={() => onChange(null)}
          size="sm"
          className="shrink-0 snap-start"
        >
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
