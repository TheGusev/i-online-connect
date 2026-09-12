import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { mediaApi, type ProfileMedia } from "@/api";

/** Столько фото и одно видео-интро помещается в профиль (совпадает с backend). */
export const MAX_PROFILE_PHOTOS = 5;
const MAX_PROFILE_VIDEOS = 1;

/**
 * Загрузка, удаление и выбор главного кадра для своего профиля.
 *
 * Главное фото сразу становится аватаром — поэтому после любого действия
 * перезапрашиваем профиль.
 */
export function useMediaActions(media: ProfileMedia[]) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

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

    setBusy(true);
    setProgress(0);
    try {
      await mediaApi.uploadMedia(file, file.name, setProgress);
      await refresh();
      toast.success("Файл добавлен в профиль");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const makePrimary = async (id: string) => {
    setBusy(true);
    try {
      await mediaApi.setPrimaryMedia(id);
      await refresh();
      toast.success("Это фото теперь главное");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось обновить фото");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await mediaApi.deleteMedia(id);
      await refresh();
      toast("Файл удалён");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось удалить файл");
    } finally {
      setBusy(false);
    }
  };

  const hint =
    progress !== null
      ? `Загружаем… ${progress}%`
      : full
        ? "Лимит: 5 фото и 1 видео"
        : `${photos} из ${MAX_PROFILE_PHOTOS} фото`;

  return {
    busy,
    progress,
    full,
    hint,
    upload: (file: File) => void upload(file),
    makePrimary: (id: string) => void makePrimary(id),
    remove: (id: string) => void remove(id),
  };
}
