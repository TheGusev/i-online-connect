import { useState } from "react";
import { CalendarPlus } from "lucide-react";

import type { SpaceEventDraft } from "@/api";
import { BottomSheet, Button, Input, TextArea } from "@/components/ds";

/**
 * Кнопка организатора «Создать встречу» с короткой формой.
 * Встреча попадает в блок «Ближайшие события» — не текстом в общий чат.
 */
export function CreateEventForm({
  onSubmit,
  submitting,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  onSubmit: (draft: SpaceEventDraft) => Promise<void>;
  submitting?: boolean | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  hideTrigger?: boolean | undefined;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [online, setOnline] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };

  const valid = title.trim().length >= 3 && startsAt.length > 0;

  const submit = async () => {
    if (!valid) return;
    try {
      await onSubmit({
        title: title.trim(),
        // datetime-local отдаёт время без зоны — приводим к ISO с зоной устройства.
        startsAt: new Date(startsAt).toISOString(),
        place: online ? "Онлайн" : place.trim(),
        description: description.trim(),
      });
    } catch {
      return;
    }
    setOpen(false);
    setTitle("");
    setStartsAt("");
    setPlace("");
    setDescription("");
    setOnline(false);
  };

  return (
    <>
      {!hideTrigger ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus aria-hidden="true" />
          Создать встречу
        </Button>
      ) : null}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Новая встреча"
        description="Участники увидят её карточкой и смогут отметить «Буду»."
      >
        <Input label="Название встречи" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Дата и время"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Встреча онлайн
        </label>
        {!online ? (
          <Input label="Место" value={place} onChange={(e) => setPlace(e.target.value)} />
        ) : null}
        <TextArea
          label="Краткое описание"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button fullWidth disabled={!valid} loading={submitting ?? false} onClick={() => void submit()}>
          Опубликовать встречу
        </Button>
      </BottomSheet>
    </>
  );
}
