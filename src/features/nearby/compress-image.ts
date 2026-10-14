/** Подготовка фото объявления на устройстве: сжатие и перевод в JPEG. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.82;

const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/i;
const ACCEPTED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export class PhotoPrepError extends Error {}

/** Новые размеры: длинная сторона не больше 1600px, пропорции сохраняются. */
export function fitSize(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressListingPhoto(file: File): Promise<File> {
  if (!ACCEPTED.test(file.type) && !ACCEPTED_EXT.test(file.name)) {
    throw new PhotoPrepError("Подойдут фото JPEG, PNG, WebP или HEIC");
  }
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoPrepError("Фото больше 10 МБ — выберите другое");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoPrepError(
      /heic|heif/i.test(file.type + file.name)
        ? "Этот браузер не открывает HEIC. Сохраните фото как JPEG и попробуйте снова"
        : "Не удалось прочитать фото",
    );
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoPrepError("Не удалось обработать фото");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new PhotoPrepError("Не удалось сжать фото");
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
