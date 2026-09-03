import { useQueryClient } from "@tanstack/react-query";
import { Play, Star, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { mediaApi, mediaUrl, type ProfileMedia } from "@/api";
import { Card, MediaImage } from "@/components/ds";

/** Столько фото и одно видео-интро помещается в профиль (совпадает с backend). */
export const MAX_PROFILE_PHOTOS = 5;
const MAX_PROFILE_VIDEOS = 1;

/**
 * Управление своими фото и видео: загрузка, выбор главного, удаление.
 * Главное фото сразу становится аватаром — поэтому после любого действия
 * перезапрашиваем и профиль, и сессию.
 */
export function MediaManager({ media }: { media: ProfileMedia[] }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const photos = media.filter((item) => item.kind === "photo").length;
  const videos = media.filter((item) => item.kind === "video").length;
  const full = photos >= MAX_PROFILE_PHOTOS && videos >= MAX_PROFILE_VIDEOS;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
  };

  const upload = async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    if (isVideo && videos >= MAX_PROFILE_VIDEOS) {
      toast.error("Видео-интро может быть только одно — удалите старое");
      return;
    }
    if (!isVideo && photos >= MAX_PROFILE_PHOTOS) {
      toast.error(`Можно добавить до ${MAX_PROFILE_PHOTOS} фото — удалите одно из старых`);
      return;
    }

    setBusy("upload");
    try {
      await mediaApi.uploadMedia(file, file.name);
      await refresh();
      toast.success("Файл добавлен в профиль");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось загрузить файл");
    } finally {
      setBusy(null);
    }
  };

  const makePrimary = async (id: string) => {
    setBusy(id);
    try {
      await mediaApi.setPrimaryMedia(id);
      await refresh();
      toast.success("Это фото теперь главное");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось обновить фото");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await mediaApi.deleteMedia(id);
      await refresh();
      toast("Файл удалён");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось удалить файл");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-medium">
            Фото и видео{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {photos} из {MAX_PROFILE_PHOTOS}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Главное фото видно в подборках и в шапке — с ним же сверяется видео-верификация.
          </p>
        </div>
        <label className={full ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
          <input
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            disabled={busy !== null || full}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold shadow-soft sm:px-5">
            <Upload className="size-4" aria-hidden="true" />
            {busy === "upload" ? "Загружаем…" : full ? "Лимит" : "Добавить"}
          </span>
        </label>
      </div>

      {media.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Пока пусто. Одно живое фото заметно повышает доверие к профилю.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {media.map((item) => (
            <li key={item.id} className="group relative overflow-hidden rounded-2xl bg-secondary">
              {item.kind === "video" ? (
                <video
                  src={mediaUrl(item.url)}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <MediaImage
                  src={item.url}
                  alt="Фото профиля"
                  className="aspect-square w-full object-cover"
                />
              )}

              {item.kind === "video" ? (
                <span className="pointer-events-none absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-background/90 backdrop-blur">
                  <Play className="size-3" aria-hidden="true" />
                </span>
              ) : null}

              {item.isPrimary ? (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                  <Star className="size-3 text-primary" aria-hidden="true" />
                  Главное
                </span>
              ) : null}

              <div className="absolute inset-x-1.5 bottom-1.5 flex items-end justify-between gap-1">
                {item.kind === "photo" && !item.isPrimary ? (
                  <button
                    type="button"
                    onClick={() => void makePrimary(item.id)}
                    disabled={busy !== null}
                    className="rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold backdrop-blur transition-colors hover:bg-background"
                  >
                    Главное
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  aria-label="Удалить файл"
                  onClick={() => void remove(item.id)}
                  disabled={busy !== null}
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-background/90 text-destructive backdrop-blur transition-colors hover:bg-background"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
