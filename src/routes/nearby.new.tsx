import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, X } from "lucide-react";
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
import { compressListingPhoto } from "@/features/nearby/compress-image";

const MAX_PHOTOS = 3;

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
    if (photos.length >= MAX_PHOTOS) return;
    setUploading(true);
    setProgress(0);
    try {
      const prepared = await compressListingPhoto(file);
      // Фото объявления грузим в отдельное хранилище — в профиль оно не попадёт.
      const media = await listingsApi.uploadListingPhoto(prepared, prepared.name, setProgress);
      setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, media]));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const makeCover = (id: string) =>
    setPhotos((prev) => {
      const item = prev.find((photo) => photo.id === id);
      return item ? [item, ...prev.filter((photo) => photo.id !== id)] : prev;
    });

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
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold">Фото</p>
            <span className="text-xs text-muted-foreground">до 3 фото</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: MAX_PHOTOS }, (_, slot) => {
              const photo = photos[slot];
              if (photo) {
                return (
                  <div key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-secondary">
                    <img src={photo.url} alt={`Фото ${slot + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label="Убрать фото"
                      onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== photo.id))}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-background/85 text-foreground backdrop-blur hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                    {slot === 0 ? (
                      <span className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-primary px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                        Обложка
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeCover(photo.id)}
                        className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur"
                      >
                        Сделать обложкой
                      </button>
                    )}
                  </div>
                );
              }
              if (slot === photos.length && uploading) {
                return (
                  <div key={`slot-${slot}`} className="grid aspect-square place-items-center rounded-2xl border border-primary/50 bg-secondary text-primary">
                    <div className="flex flex-col items-center gap-1">
                      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                      <span className="text-[10px] font-semibold">{progress ?? 0}%</span>
                    </div>
                  </div>
                );
              }
              const isNext = slot === photos.length;
              return (
                <label
                  key={`slot-${slot}`}
                  aria-label="Добавить фото"
                  className={`grid aspect-square place-items-center rounded-2xl border border-dashed border-border text-muted-foreground transition-colors ${isNext && !uploading ? "cursor-pointer hover:border-primary hover:text-primary" : "opacity-40"}`}
                >
                  <Plus className="size-6" aria-hidden="true" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                    className="hidden"
                    disabled={uploading || !isNext}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(file);
                    }}
                  />
                </label>
              );
            })}
          </div>
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
