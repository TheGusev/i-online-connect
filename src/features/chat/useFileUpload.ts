import { useRef, useState } from "react";
import type { Message, MessageQuote } from "@/api";
import { validateFileChoice } from "./file-rules";

export function useFileUpload<T extends { id: string; clientTempId?: string }>({ authorId, conversationId, upload, commit }: {
  authorId: string; conversationId: string;
  upload: (file: File, tempId: string, replyId: string | undefined, progress: (percent: number) => void) => Promise<T>;
  commit: (message: T) => void;
}) {
  const [pending, setPending] = useState<Message[]>([]);
  const jobs = useRef(new Map<string, { file: File; reply?: MessageQuote }>());
  const busy = useRef(false);
  const latest = useRef({ upload, commit }); latest.current = { upload, commit };
  const run = async (tempId: string) => {
    const job = jobs.current.get(tempId); if (!job || busy.current) return;
    busy.current = true;
    setPending(items => items.map(item => item.clientTempId === tempId ? { ...item, status: "sending", uploadProgress: 0 } : item));
    try {
      const result = await latest.current.upload(job.file, tempId, job.reply?.id, percent => setPending(items => items.map(item => item.clientTempId === tempId ? { ...item, uploadProgress: percent } : item)));
      latest.current.commit(result); jobs.current.delete(tempId); setPending(items => items.filter(item => item.clientTempId !== tempId));
    } catch (error) { setPending(items => items.map(item => item.clientTempId === tempId ? { ...item, status: "failed", errorMessage: error instanceof Error ? error.message : "Не удалось отправить файл" } : item)); }
    finally { busy.current = false; }
  };
  const send = (file: File, reply?: MessageQuote) => {
    const error = validateFileChoice(file); if (error) throw new Error(error);
    if (busy.current) return;
    const tempId = crypto.randomUUID(); jobs.current.set(tempId, { file, ...(reply ? { reply } : {}) });
    setPending(items => [...items, { id: `tmp-${tempId}`, clientTempId: tempId, authorId, conversationId, kind: "file", text: `Файл: ${file.name}`, fileName: file.name, fileSize: file.size, mediaMime: file.type, createdAt: new Date().toISOString(), status: "sending", ...(reply ? { replyTo: reply } : {}) }]);
    void run(tempId);
  };
  return { pending, send, retry: (id: string) => { void run(id); }, sending: pending.some(item => item.status === "sending") };
}