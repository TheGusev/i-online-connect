import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, Chip, Input } from "@/components/ds";

/** Готовые варианты ответов: человек выбирает, а не пишет сочинение. */
export const VALUE_OPTIONS = {
  values: [
    "Честность",
    "Забота",
    "Свобода",
    "Надёжность",
    "Юмор",
    "Развитие",
    "Семья",
    "Уважение границ",
    "Любознательность",
    "Спокойствие",
  ],
  joy: [
    "Искренность",
    "Глубокие разговоры",
    "Лёгкий юмор",
    "Общие планы",
    "Внимание к деталям",
    "Тишина вдвоём",
    "Совместные дела",
  ],
  dealbreakers: [
    "Ложь",
    "Грубость",
    "Ревность",
    "Игры в молчание",
    "Неуважение",
    "Исчезновения без слов",
  ],
} as const;

export type ValuesKey = keyof typeof VALUE_OPTIONS;

const MAX_PER_GROUP = 3;

function Group({
  groupKey,
  selected,
  onToggle,
}: {
  groupKey: ValuesKey;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState("");

  const options = [...new Set([...VALUE_OPTIONS[groupKey], ...selected])];
  const canAdd =
    custom.trim().length > 1 &&
    !options.some((item) => item.toLowerCase() === custom.trim().toLowerCase()) &&
    selected.length < MAX_PER_GROUP;

  const addCustom = () => {
    onToggle(custom.trim());
    setCustom("");
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <p className="text-sm font-bold">{t(`onboarding.s6.${groupKey}`)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("onboarding.s6.limit", { max: MAX_PER_GROUP })}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((item) => {
          const isSelected = selected.includes(item);
          return (
            <Chip
              key={item}
              variant="interest"
              selected={isSelected}
              disabled={!isSelected && selected.length >= MAX_PER_GROUP}
              onClick={() => onToggle(item)}
            >
              {item}
            </Chip>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          label={t("onboarding.s6.own")}
          value={custom}
          className="flex-1"
          onChange={(event) => setCustom(event.target.value.slice(0, 40))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canAdd) {
              event.preventDefault();
              addCustom();
            }
          }}
        />
        <Button variant="secondary" size="sm" disabled={!canAdd} onClick={addCustom}>
          <Plus aria-hidden="true" />
          {t("onboarding.s6.add")}
        </Button>
      </div>
    </div>
  );
}

export function ValuesPicker({
  selection,
  onToggle,
  onSubmit,
  error,
}: {
  selection: Record<ValuesKey, string[]>;
  onToggle: (groupKey: ValuesKey, value: string) => void;
  onSubmit: () => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {(Object.keys(VALUE_OPTIONS) as ValuesKey[]).map((groupKey) => (
        <Group
          key={groupKey}
          groupKey={groupKey}
          selected={selection[groupKey]}
          onToggle={(value) => onToggle(groupKey, value)}
        />
      ))}
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={onSubmit}>{t("onboarding.chat.next")}</Button>
      </div>
    </div>
  );
}
