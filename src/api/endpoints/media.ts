import { request, upload } from "../client";
import type { ProfileMedia } from "../types";

/**
 * Загрузка фото или видео профиля. Файл уходит на сервер как multipart,
 * тип определяется по содержимому — расширению никто не верит.
 *
 * onProgress получает проценты отправки: без него интерфейс не мог отличить
 * «ещё идёт» от «зависло навсегда».
 */
export async function uploadMedia(
  file: File | Blob,
  filename = "upload",
  onProgress?: (percent: number) => void,
): Promise<ProfileMedia> {
  const form = new FormData();
  form.append("file", file, filename);
  return upload<ProfileMedia>("/media", form, onProgress);
}

/** Сделать фото главным: оно становится аватаром и основой верификации. */
export async function setPrimaryMedia(id: string): Promise<ProfileMedia> {
  return request<ProfileMedia>(`/media/${id}/primary`, { method: "PATCH" });
}

/** Удаление своего файла из профиля. */
export async function deleteMedia(id: string): Promise<void> {
  await request<void>(`/media/${id}`, { method: "DELETE" });
}
