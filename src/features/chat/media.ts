/**
 * Подготовка фото и видео к отправке в чат.
 *
 * Фото уменьшаем прямо в браузере: длинная сторона до 1600 px — так вложение
 * уходит за секунды даже на мобильном интернете. Видео не перекодируем,
 * только проверяем формат, вес и длительность, чтобы не грузить телефон.
 * Сервер повторяет все проверки — это лишь быстрая подсказка человеку.
 */

export const CHAT_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const CHAT_VIDEO_MIME = ["video/mp4", "video/webm"] as const;

export const MAX_CHAT_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_CHAT_VIDEO_BYTES = 45 * 1024 * 1024;
export const MAX_CHAT_VIDEO_SECONDS = 60;
const MAX_IMAGE_SIDE = 1600;

/** Что можно выбрать в системном диалоге выбора файла. */
export const CHAT_MEDIA_ACCEPT = [...CHAT_IMAGE_MIME, ...CHAT_VIDEO_MIME].join(",");

export type ChatMediaKind = "image" | "video";

export interface PreparedMedia {
  file: File;
  kind: ChatMediaKind;
  /** blob: ссылка для предпросмотра — освобождается вызывающим кодом. */
  previewUrl: string;
  durationMs?: number;
}

function mb(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

async function videoDurationMs(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => {
        const seconds = Number.isFinite(video.duration) ? video.duration : 0;
        resolve(Math.round(seconds * 1000));
      };
      video.onerror = () => reject(new Error("Не удалось прочитать видео — попробуйте другой файл"));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function shrinkImage(file: File): Promise<File> {
  // Без canvas (очень старый браузер) отправляем файл как есть — решит сервер.
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_IMAGE_SIDE) {
    bitmap.close();
    return file;
  }
  const scale = MAX_IMAGE_SIDE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG сохраняем PNG: там может быть прозрачность, остальное — в JPEG.
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), mime, 0.85),
  );
  if (!blob) return file;
  const name = mime === "image/png" ? "photo.png" : "photo.jpg";
  return new File([blob], name, { type: mime });
}

export async function prepareChatMedia(input: File): Promise<PreparedMedia> {
  const isImage = (CHAT_IMAGE_MIME as readonly string[]).includes(input.type);
  const isVideo = (CHAT_VIDEO_MIME as readonly string[]).includes(input.type);
  if (!isImage && !isVideo) {
    throw new Error("Можно отправить фото JPEG, PNG, WebP или видео MP4, WebM");
  }

  if (isImage) {
    const file = await shrinkImage(input);
    if (file.size > MAX_CHAT_PHOTO_BYTES) {
      throw new Error(`Фото весит ${mb(file.size)} МБ — нужно до 15 МБ`);
    }
    return { file, kind: "image", previewUrl: URL.createObjectURL(file) };
  }

  if (input.size > MAX_CHAT_VIDEO_BYTES) {
    throw new Error(`Видео весит ${mb(input.size)} МБ — нужно до 45 МБ`);
  }
  const durationMs = await videoDurationMs(input);
  if (durationMs > (MAX_CHAT_VIDEO_SECONDS + 1) * 1000) {
    throw new Error("Видео длиннее минуты — обрежьте его и отправьте снова");
  }
  return {
    file: input,
    kind: "video",
    previewUrl: URL.createObjectURL(input),
    durationMs,
  };
}
