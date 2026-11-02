import { API_URL, getToken, mediaUrl } from "@/api/client";
import { toast } from "sonner";
import { downloadMethod } from "./file-rules";

export async function loadFileBlob(url: string, download = false): Promise<Blob> {
  const protectedFile = /^\/api\/(chat\/conversations\/[^/]+|spaces\/[^/]+)\/files\//.test(url);
  const address = protectedFile ? `${API_URL.replace(/\/$/, "")}/${url.replace(/^\/api\//, "")}${download ? "?download=1" : ""}` : mediaUrl(url) ?? url;
  const token = protectedFile ? getToken() : null;
  const response = await fetch(address, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
  if (!response.ok) throw new Error("Не удалось загрузить файл");
  return response.blob();
}
export async function saveChatFile(url: string, name: string, image = false): Promise<void> {
  try {
    const blob = await loadFileBlob(url, true);
    const file = new File([blob], name, { type: blob.type });
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const method = downloadMethod(ios, Boolean(navigator.canShare?.({ files: [file] })), "download" in document.createElement("a"));
    if (method === "share") { await navigator.share({ files: [file] }); return; }
    const objectUrl = URL.createObjectURL(blob);
    if (method === "download") {
      const a = document.createElement("a"); a.href = objectUrl; a.download = name; a.click();
    } else {
      const a = document.createElement("a"); a.href = objectUrl; a.target = "_blank"; a.rel = "noopener"; a.click();
      if (image) toast("Удерживайте картинку и выберите «Сохранить»");
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast.error(error instanceof Error ? error.message : "Не удалось сохранить файл");
  }
}