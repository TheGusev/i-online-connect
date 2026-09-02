import { useQueryClient } from "@tanstack/react-query";
import { Play, Star, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { mediaApi, type ProfileMedia } from "@/api";
import { Card } from "@/components/ds";

/**
 * Управление своими фото и видео: загрузка, выбор главного, удаление.
 * Главное фото сразу становится аватаром — поэтому после любого действия
 * перезапрашиваем и профиль, и сессию.
 */
export function MediaManager({ media }: { media: ProfileMedia[] }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
  };

  const upload = async (file: File) => {
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
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-medium">Фото и видео</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Главное фото видно в подборках и в шапке — с ним же сверяется видео-верификация.
          </p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <span className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold shadow-soft">
            <Upload className="size-4" aria-hidden="true" />
            {busy === "upload" ? "Загружаем…" : "Добавить"}
          </span>
        </label>
      </div>

      {media.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Пока пусто. Одно живое фото заметно повышает доверие к профилю.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item) => (
            <li key={item.id} className="group relative overflow-hidden rounded-2xl bg-secondary">
              {item.kind === "video" ? (
                <div className="grid aspect-square w-full place-items-center text-muted-foreground">
                  <Play className="size-6" aria-hidden="true" />
                </div>
              ) : (
                <img src={item.url} alt="" className="aspect-square w-full object-cover" />
              )}

              {item.isPrimary ? (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                  <Star className="size-3 text-primary" aria-hidden="true" />
                  Главное
                </span>
              ) : null}

              <div className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
                {item.kind === "photo" && !item.isPrimary ? (
                  <button
                    type="button"
                    onClick={() => void makePrimary(item.id)}
                    disabled={busy !== null}
                    className="rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors hover:bg-background"
                  >
                    Сделать главным
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  aria-label="Удалить файл"
                  onClick={() => void remove(item.id)}
                  disabled={busy !== null}
                  className="grid size-8 place-items-center rounded-full bg-background/90 text-destructive backdrop-blur transition-colors hover:bg-background"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
