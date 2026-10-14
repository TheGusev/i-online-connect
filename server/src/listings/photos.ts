/** Сколько фото можно приложить к одному объявлению. */
export const MAX_LISTING_PHOTOS = 3;

export type ListingPhotosProblem = "TOO_MANY_PHOTOS" | "DUPLICATE_PHOTOS" | null;

/** Чистое правило набора фото: от 0 до 3, порядок задаёт клиент, без повторов. */
export function checkListingPhotos(ids: readonly string[]): ListingPhotosProblem {
  if (ids.length > MAX_LISTING_PHOTOS) return "TOO_MANY_PHOTOS";
  if (new Set(ids).size !== ids.length) return "DUPLICATE_PHOTOS";
  return null;
}
