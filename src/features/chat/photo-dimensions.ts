export interface PhotoDimensions { width: number; height: number }
// Client presentation only: keep geometry across blob → HTTP/WS replacement/refetch.
const dimensions = new Map<string, PhotoDimensions>();
export const rememberPhotoDimensions = (key: string, value: PhotoDimensions) => {
  if (value.width > 0 && value.height > 0) dimensions.set(key, value);
};
export const getPhotoDimensions = (key: string | undefined) => key ? dimensions.get(key) : undefined;

export function photoAspectRatio(value?: PhotoDimensions) {
  return value ? Math.max(1.06, Math.min(2.375, value.width / value.height)) : 1.06;
}

export async function readPhotoDimensions(url: string): Promise<PhotoDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const value = { width: image.naturalWidth, height: image.naturalHeight };
      rememberPhotoDimensions(url, value);
      resolve(value);
    };
    image.onerror = () => reject(new Error("Не удалось прочитать размеры фото"));
    image.src = url;
  });
}