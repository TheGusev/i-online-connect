import { useState } from "react";
import { ImagePlus } from "lucide-react";

import type { SpaceCadence, SpaceCategory, SpaceDraft, SpaceFormat } from "@/api";
import { Button, Input, Select, TextArea } from "@/components/ds";
import { cadenceLabels, categoryLabels, formatLabels } from "@/features/spaces/labels";
import { cn } from "@/lib/utils";

import coverRun from "@/assets/space-run.jpg";
import coverBoardgames from "@/assets/space-boardgames.jpg";
import coverIt from "@/assets/space-it.jpg";
import coverWalk from "@/assets/space-walk.jpg";
import coverBooks from "@/assets/space-books.jpg";
import coverCook from "@/assets/space-cook.jpg";

const covers = [coverRun, coverWalk, coverBoardgames, coverIt, coverBooks, coverCook];

const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

export function CreateSpaceForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (draft: SpaceDraft) => void;
  submitting?: boolean | undefined;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SpaceCategory>("city");
  const [format, setFormat] = useState<SpaceFormat>("offline");
  const [cadence, setCadence] = useState<SpaceCadence>("biweekly");
  const [city, setCity] = useState("Новосибирск");
  const [coverUrl, setCoverUrl] = useState<string>(covers[0]!);

  const valid = title.trim().length >= 3 && description.trim().length >= 20;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit({
          title: title.trim(),
          description: description.trim(),
          category,
          format,
          cadence,
          city: city.trim(),
          coverUrl,
        });
      }}
    >
      <Input
        label="Название"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        hint="Например: «Утренние пробежки по выходным»"
      />

      <TextArea
        label="Описание"
        value={description}
        rows={5}
        onChange={(event) => setDescription(event.target.value)}
        hint="Расскажите, как проходят встречи и кому будет комфортно прийти"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Категория"
          value={category}
          options={toOptions(categoryLabels)}
          onChange={(event) => setCategory(event.target.value as SpaceCategory)}
        />
        <Select
          label="Формат"
          value={format}
          options={toOptions(formatLabels)}
          onChange={(event) => setFormat(event.target.value as SpaceFormat)}
        />
        <Select
          label="Периодичность встреч"
          value={cadence}
          options={toOptions(cadenceLabels)}
          onChange={(event) => setCadence(event.target.value as SpaceCadence)}
        />
        <Input label="Город" value={city} onChange={(event) => setCity(event.target.value)} />
      </div>

      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <ImagePlus className="size-4" aria-hidden="true" />
          Обложка
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {covers.map((cover) => (
            <button
              key={cover}
              type="button"
              aria-label="Выбрать обложку"
              aria-pressed={cover === coverUrl}
              onClick={() => setCoverUrl(cover)}
              className={cn(
                "overflow-hidden rounded-2xl border-2 transition-colors",
                cover === coverUrl ? "border-community" : "border-transparent hover:border-border",
              )}
            >
              <img
                src={cover}
                alt=""
                loading="lazy"
                width={1024}
                height={640}
                className="aspect-[4/3] size-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        fullWidth
        loading={submitting ?? false}
        disabled={!valid}
        className="bg-community text-community-foreground hover:bg-community/90"
      >
        Создать пространство
      </Button>
      <p className="text-xs text-muted-foreground">
        Бейдж «Проверенное сообщество» появляется после того, как модерация увидит первые живые
        встречи.
      </p>
    </form>
  );
}
