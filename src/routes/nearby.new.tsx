import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { listingsApi, type NeedCategory } from "@/api";
import type { ListingPhoto } from "@/api/endpoints/listings";
import { Button, Chip, Input, TextArea } from "@/components/ds";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { CategoryChips } from "@/features/nearby/components/CategoryChips";
import { useCreateListing } from "@/features/nearby/hooks";
import { CATEGORY_ORDER, priceApplies } from "@/features/nearby/labels";
import { DatingLockSheet } from "@/features/nearby/components/DatingLockSheet";
import {
  LISTING_DURATIONS,
  durationForCategory,
  durationLabel,
  expiryLabel,
} from "@/features/nearby/durations";
import { useMyProfile } from "@/features/profile/hooks";

export const Route = createFileRoute("/nearby/new")({
  validateSearch: (search: Record<string, unknown>): { category?: NeedCategory } =>
    CATEGORY_ORDER.includes(search["category"] as NeedCategory)
      ? { category: search["category"] as NeedCategory }
      : {},
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

  const search = Route.useSearch();
  const me = useMyProfile();
  const datingOpen = me.data?.completeness?.complete === true;
  const [lockOpen, setLockOpen] = useState(false);
  const [category, setCategory] = useState<NeedCategory>(
    search.category && search.category !== "dating" ? search.category : "urgent",
  );
  // Пришли с «Рядом» с «Знакомствами» без анкеты — показываем окно с замком.
  useEffect(() => {
    if (search.category !== "dating" || me.isPending) return;
    if (datingOpen) setCategory("dating");
    else setLockOpen(true);
  }, [search.category, me.isPending, datingOpen]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [district, setDistrict] = useState("");
  const [minutes, setMinutes] = useState<number>(LISTING_DURATIONS.urgent.default);
  // Плавная смена блока срока: короткое скрытие и показ вариантов новой категории.
  const [shownCategory, setShownCategory] = useState<NeedCategory>(category);
  const [durationOpen, setDurationOpen] = useState(true);
  useEffect(() => {
    setMinutes((prev) => durationForCategory(category, prev));
    if (category === shownCategory) return;
    setDurationOpen(false);
    const timer = window.setTimeout(() => {
      setShownCategory(category);
      setDurationOpen(true);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [category, shownCategory]);
  const expiresAt = useMemo(() => expiryLabel(minutes), [minutes]);
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const showPrice = priceApplies(category);
  const canSubmit = title.trim().length >= 3 && !create.isPending && !uploading;

  const upload = async (file: File) => {
    setUploading(true);
    setProgress(0);
    try {
      // Фото объявления грузим в отдельное хранилище — в профиль оно не попадёт.
      const media = await listingsApi.uploadListingPhoto(file, file.name, setProgress);
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
        district: district.trim() || undefined,
        mediaIds: photos.map((item) => item.id),
        expiresInMinutes: minutes,
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
        className="max-w-full space-y-6 overflow-x-hidden pb-28 [&>*]:min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) submit();
        }}
      >
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">Категория</legend>
          <CategoryChips
            layout="grid"
            value={category}
            allowEmpty={false}
            locked={datingOpen ? [] : ["dating"]}
            onLocked={() => setLockOpen(true)}
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

        <Input
          label="Район (необязательно)"
          value={district}
          maxLength={120}
          onChange={(event) => setDistrict(event.target.value)}
          hint="Точный адрес не нужен — район помогает понять, насколько это близко"
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

        <fieldset>
          <legend className="mb-3 text-sm font-semibold">Срок актуальности</legend>
          <div className="duration-reveal" data-open={durationOpen}>
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-wrap gap-1.5">
                {LISTING_DURATIONS[shownCategory].options.map((option) => (
                  <Chip
                    key={option}
                    size="sm"
                    selected={minutes === option}
                    className="min-h-9 px-3 text-xs"
                    onClick={() => setMinutes(option)}
                  >
                    {durationLabel(option)}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Объявление исчезнет: {expiresAt}</p>
            </div>
          </div>
        </fieldset>

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
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          options={[
            { value: "15", label: "15 минут" },
            { value: "30", label: "30 минут" },
            { value: "60", label: "1 час" },
            { value: "180", label: "3 часа" },
            { value: "360", label: "6 часов" },
            { value: "1440", label: "24 часа" },
          ]}
        />

        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-auto lg:right-0 lg:w-[calc(100%-16rem)] lg:justify-center">
          <Button type="submit" className="flex-1 lg:flex-none" disabled={!canSubmit} loading={create.isPending}>
            Опубликовать
          </Button>
          <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/nearby" })}>
            Отмена
          </Button>
        </div>
      </form>
      <DatingLockSheet
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        completeness={me.data?.completeness}
        guest={false}
        onFill={() => {
          setLockOpen(false);
          void navigate({ to: "/profile/me", search: { edit: true } });
        }}
      />
    </AppShell>
  );
}
