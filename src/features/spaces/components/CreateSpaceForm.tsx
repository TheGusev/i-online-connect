import { useState } from "react";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import type { SpaceCadence, SpaceCategory, SpaceDraft, SpaceFormat } from "@/api";
import { mediaUrl, spacesApi } from "@/api";
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

const MIN_TITLE = 3;
const MIN_DESCRIPTION = 20;

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
  const [uploading, setUploading] = useState(false);
  // Ошибки показываем только после попытки отправки: пустая форма не «краснеет».
  const [touched, setTouched] = useState(false);

  const titleError =
    title.trim().length < MIN_TITLE ? `Нужно минимум ${MIN_TITLE} символа названия` : null;
  const descriptionError =
    description.trim().length < MIN_DESCRIPTION
      ? `Опишите встречи подробнее — минимум ${MIN_DESCRIPTION} символов`
      : null;
  const cityError = city.trim().length < 2 ? "Укажите город" : null;
  const firstError = titleError ?? descriptionError ?? cityError;

  async function handleCoverFile(file: File) {
    setUploading(true);
    try {
      const { url } = await spacesApi.uploadSpaceCover(file);
      setCoverUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить обложку");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        // Кнопка всегда активна: если чего-то не хватает — говорим что именно.
        if (firstError) {
          toast.error(firstError);
          return;
        }
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
        {...(touched && titleError ? { error: titleError } : {})}
        hint="Например: «Утренние пробежки по выходным»"
      />

      <TextArea
        label="Описание"
        value={description}
        rows={5}
        onChange={(event) => setDescription(event.target.value)}
        {...(touched && descriptionError ? { error: descriptionError } : {})}
        hint={`Расскажите, как проходят встречи и кому будет комфортно прийти — ${description.trim().length}/${MIN_DESCRIPTION} символов`}
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
        <Input
          label="Город"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          {...(touched && cityError ? { error: cityError } : {})}
        />
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

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-4" aria-hidden="true" />
          )}
          {uploading ? "Загружаем…" : "Своё фото"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleCoverFile(file);
            }}
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG или WebP до 8 МБ.</p>

        {!covers.includes(coverUrl) ? (
          <img
            src={mediaUrl(coverUrl)}
            alt="Загруженная обложка"
            className="mt-3 aspect-[4/3] w-40 rounded-2xl border-2 border-community object-cover"
          />
        ) : null}
      </div>

      <Button
        type="submit"
        fullWidth
        loading={submitting ?? false}
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
