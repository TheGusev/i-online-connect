import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { NeedCategory } from "@/api";
import { Button, Card } from "@/components/ds";
import { useMyNeeds, useSaveMyNeeds } from "@/features/nearby/hooks";
import { categories } from "@/features/nearby/labels";

/**
 * «Мои потребности» — что человек ищет или готов предложить в разделе «Рядом».
 * По этим категориям приходят уведомления о новых объявлениях в городе.
 */
export function NeedsSection() {
  const { data, isLoading } = useMyNeeds();
  const save = useSaveMyNeeds();
  const [selected, setSelected] = useState<NeedCategory[]>([]);

  useEffect(() => {
    if (data) setSelected(data.categories);
  }, [data]);

  const toggle = (id: NeedCategory) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const submit = () => {
    save.mutate(selected, {
      onSuccess: () => toast.success("Сохранили — будем сообщать о таких объявлениях"),
      onError: (cause) =>
        toast.error(cause instanceof Error ? cause.message : "Не удалось сохранить"),
    });
  };

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Загружаем…</Card>;
  }

  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold">Что вам интересно в разделе «Рядом»</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Отметьте категории — и мы сообщим, когда в вашем городе появится подходящее объявление.
      </p>

      <ul className="mt-5 space-y-3">
        {categories.map(({ id, label, hint, icon: Icon }) => (
          <li key={id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 transition-colors hover:bg-secondary/50">
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={() => toggle(id)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Button className="mt-5" onClick={submit} loading={save.isPending}>
        Сохранить
      </Button>
    </Card>
  );
}
