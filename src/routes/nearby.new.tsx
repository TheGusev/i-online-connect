import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { mediaApi, type NeedCategory, type ProfileMedia } from "@/api";
import { Button, Input, Select, TextArea } from "@/components/ds";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { CategoryChips } from "@/features/nearby/components/CategoryChips";
import { useCreateListing } from "@/features/nearby/hooks";
import { priceApplies } from "@/features/nearby/labels";

export const Route = createFileRoute("/nearby/new")({
  head: () => ({
    meta: [
      { title: "Новое объявление в разделе «Рядом» — Я Онлайн" },
      {
        name: "description",
        content:
          "Разместите объявление: продажа, услуга, совместный досуг, поездка или просьба о помощи. Город берётся из профиля.",
      },
      { property: "og:title", content: "Новое объявление — Я Онлайн" },
      {
        property: "og:description",
        content: "Опишите задачу простыми словами — люди из вашего города увидят её первыми.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewListingPage,
});

function NewListingPage() {
  const navigate = useNavigate();
  const create = useCreateListing();

  const [category, setCategory] = useState<NeedCategory>("service");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("7");
  const [photos, setPhotos] = useState<ProfileMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const showPrice = priceApplies(category);
  const canSubmit = title.trim().length >= 3 && !create.isPending && !uploading;

  const upload = async (file: File) => {
    setUploading(true);
    setProgress(0);
    try {
      const media = await mediaApi.uploadMedia(file, file.name, setProgress);
      setPhotos((prev) => [...prev, media]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const submit = () => {
    const rubles = Number(price.replace(",", "."));
    const priceMinor =
      showPrice && price.trim() && Number.isFinite(rubles) ? Math.round(rubles * 100) : null;

    create.mutate(
      {
        category,
        title: title.trim(),
        description: description.trim(),
        priceMinor,
        mediaIds: photos.map((item) => item.id),
        expiresInDays: Number(days),
      },
      {
        onSuccess: (listing) => {
          toast.success("Объявление опубликовано", {
            description: "Людям из вашего города с похожими интересами уже ушло уведомление.",
          });
          void navigate({ to: "/nearby/$id", params: { id: listing.id } });
        },
        onError: (cause) => {
          toast.error(cause instanceof Error ? cause.message : "Не удалось опубликовать");
        },
      },
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="Новое объявление"
        description="Город подставим из профиля — повторно спрашивать не будем."
      />

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) submit();
        }}
      >
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">Категория</legend>
          <CategoryChips
            value={category}
            allowEmpty={false}
            onChange={(next) => next && setCategory(next)}
          />
        </fieldset>

        <Input
          label="Заголовок"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          hint="Коротко и по делу: «Отдам детский велосипед», «Нужен репетитор по математике»"
        />

        <TextArea
          label="Описание"
          value={description}
          rows={5}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
        />

        {showPrice ? (
          <Input
            label="Цена, ₽ (необязательно)"
            value={price}
            inputMode="decimal"
            onChange={(event) => setPrice(event.target.value)}
            hint="Оставьте пустым — покажем «Договорная»"
          />
        ) : null}

        <div>
          <p className="mb-3 text-sm font-semibold">Фото</p>
          <div className="flex flex-wrap gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                <img
                  src={photo.url}
                  alt=""
                  className="size-24 rounded-2xl border border-border object-cover"
                />
                <button
                  type="button"
                  aria-label="Убрать фото"
                  onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== photo.id))}
                  className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}

            <label className="grid size-24 cursor-pointer place-items-center rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              <ImagePlus className="size-5" aria-hidden="true" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
          </div>
          {uploading ? (
            <p className="mt-2 text-xs text-muted-foreground">Загружаем фото… {progress ?? 0}%</p>
          ) : null}
        </div>

        <Select
          label="Срок актуальности"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          options={[
            { value: "7", label: "7 дней" },
            { value: "14", label: "14 дней" },
            { value: "30", label: "30 дней" },
          ]}
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!canSubmit} loading={create.isPending}>
            Опубликовать
          </Button>
          <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/nearby" })}>
            Отмена
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
