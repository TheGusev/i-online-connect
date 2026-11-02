import { Download, FileArchive, FileText, Image, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Message } from "@/api";
import { Button, Modal } from "@/components/ds";
import { filePreviewKind, fileSizeLabel } from "../file-rules";
import { loadFileBlob, saveChatFile } from "../file-download";

export function FileAttachment({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const kind = filePreviewKind(message.mediaMime ?? "");
  const name = message.fileName ?? "Файл";
  useEffect(() => {
    if (!open || !message.mediaUrl) return;
    let cancelled = false; let objectUrl = "";
    setLoading(true); setError(""); setContent("");
    void loadFileBlob(message.mediaUrl).then(async blob => {
      if (cancelled) return;
      if (kind === "text") { setContent(await blob.slice(0, 256 * 1024).text()); }
      else { objectUrl = URL.createObjectURL(blob); setContent(objectUrl); }
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось открыть файл"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [open, message.mediaUrl, kind]);
  const Icon = kind === "image" ? Image : /zip/.test(message.mediaMime ?? "") ? FileArchive : FileText;
  const ready = message.status !== "sending" && message.status !== "failed";
  return <>
    <div className="flex w-56 max-w-full items-center gap-2" data-no-swipe>
      <Icon className="size-8 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Button variant="ghost" size="sm" className="h-auto max-w-full justify-start p-0 text-inherit" disabled={!ready || kind === "download"} onClick={() => setOpen(true)} title={name}><span className="truncate">{name}</span></Button>
        <p className="text-xs opacity-80">{fileSizeLabel(message.fileSize ?? 0)}</p>
        {message.status === "sending" ? <progress max={100} value={message.uploadProgress ?? 0} className="h-1 w-full accent-primary" aria-label="Загрузка файла" /> : null}
      </div>
      <Button size="icon" variant="ghost" className="size-8 text-inherit" aria-label="Скачать" disabled={!ready} onClick={() => { if (message.mediaUrl) void saveChatFile(message.mediaUrl, name); }}><Download /></Button>
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title={name} className="max-w-3xl" footer={<Button variant="secondary" onClick={() => { if (message.mediaUrl) void saveChatFile(message.mediaUrl, name); }}><Download />Скачать</Button>}>
      {loading ? <Loader2 className="size-6 animate-spin" aria-label="Загрузка" /> : error ? <p role="alert">{error}</p> : kind === "text" ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{content}</pre> : kind === "image" ? <img src={content} alt={name} className="max-h-96 w-full object-contain" /> : <><iframe title={name} src={content} className="h-96 w-full" /><Button asChild variant="secondary"><a href={content} target="_blank" rel="noopener">Открыть PDF</a></Button></>}
    </Modal>
  </>;
}