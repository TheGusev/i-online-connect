/** Routing hint only; the server must validate actual file content. */
export const CHAT_VIDEO_EXTENSIONS = [
  "mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp", "3g2",
] as const;

const IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp",
] as const;

export function chatMediaKind(
  file: { name: string; type: string },
): "image" | "video" | null {
  const mime = file.type.split(";")[0]!.trim().toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime && mime !== "application/octet-stream" && mime !== "application/mp4") {
    return null;
  }
  if ((CHAT_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return "video";
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return "image";
  return null;
}
