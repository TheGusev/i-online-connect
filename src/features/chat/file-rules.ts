export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FILE_ACCEPT =
  ".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.ico,.avif,.heic,.heif";
export function validateFileChoice(file: Pick<File, "name" | "size">): string | null {
  if (!file.size) return "Файл пустой";
  if (file.size > MAX_FILE_BYTES) return "Файл больше 25 МБ";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !FILE_ACCEPT.split(",").includes(`.${ext}`)) return "Этот тип файла запрещён";
  return null;
}
export function filePreviewKind(mime: string): "pdf" | "text" | "image" | "download" {
  if (mime === "application/pdf") return "pdf";
  if (/^text\/(plain|csv)/.test(mime)) return "text";
  if (mime.startsWith("image/")) return "image";
  return "download";
}
export function downloadMethod(
  ios: boolean,
  canShareFile: boolean,
  downloadSupported: boolean,
): "share" | "download" | "open" {
  return ios
    ? canShareFile
      ? "share"
      : "open"
    : downloadSupported
      ? "download"
      : canShareFile
        ? "share"
        : "open";
}
export function fileSizeLabel(size: number) {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(size / 1024))} КБ`;
}
