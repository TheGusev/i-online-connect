import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, Chip, Input } from "@/components/ds";

const SUGGESTED = [
  "Пешие походы",
  "Бег",
  "Кофе по утрам",
  "Настольные игры",
  "Кино не для всех",
  "Живая музыка",
  "Фотография",
  "Волонтёрство",
  "Кулинария",
  "Йога",
  "Книги",
  "Психология",
  "Путешествия поездами",
  "Велосипед",
  "Театр",
  "Программирование",
  "Языки",
  "Плавание",
  "Керамика",
  "Астрономия",
];

export function InterestsPicker({
  selected,
  onToggle,
  onSubmit,
  error,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onSubmit: () => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = [...new Set([...selected, ...SUGGESTED])];
    return q ? pool.filter((item) => item.toLowerCase().includes(q)) : pool;
  }, [query, selected]);

  const canAddCustom =
    query.trim().length > 1 &&
    !filtered.some((item) => item.toLowerCase() === query.trim().toLowerCase());

  const addCustom = () => {
    onToggle(query.trim());
    setQuery("");
  };

  return (
    <div className="space-y-4">
      <Input
        label={t("onboarding.s5.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && canAddCustom) {
            event.preventDefault();
            addCustom();
          }
        }}
      />

      {canAddCustom && (
        <Button variant="secondary" size="sm" onClick={addCustom}>
          <Plus aria-hidden="true" />
          {t("onboarding.s5.add", { value: query.trim() })}
        </Button>
      )}

      <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto p-0.5">
        {filtered.map((item) => (
          <Chip
            key={item}
            variant="interest"
            selected={selected.includes(item)}
            onClick={() => onToggle(item)}
          >
            {item}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ?? t("onboarding.s5.chosen", { count: selected.length })}
        </p>
        <Button onClick={onSubmit}>{t("onboarding.chat.next")}</Button>
      </div>
    </div>
  );
}
