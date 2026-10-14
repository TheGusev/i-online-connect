import { useCallback, useEffect, useRef, useState } from "react";

import type { PreparedMedia } from "@/features/chat/media";

/** Пауза между фото: сервер ограничивает частоту отправки. */
const SEND_PAUSE_MS = 150;

export interface PendingPhoto {
  id: string;
  clientTempId: string;
  authorId: string;
  createdAt: string;
  kind: "image";
  text: string;
  mediaUrl: string;
  mediaMime: string;
  status: "sending" | "failed";
  errorMessage?: string;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Отправка нескольких фото: каждое уходит отдельным сообщением строго по порядку,
 * а до ответа сервера показывается из локального превью. Подпись — следом текстом.
 */
export function usePhotoBatch<T extends { clientTempId?: string | undefined }>({
  authorId,
  upload,
  commit,
}: {
  authorId: string;
  upload: (file: File, clientTempId: string) => Promise<T>;
  commit: (message: T) => void;
}) {
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const files = useRef(new Map<string, File>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef({ upload, commit });
  latest.current = { upload, commit };

  useEffect(
    () => () => {
      // Уходим из чата — освобождаем локальные превью.
      setPending((items) => {
        items.forEach((item) => URL.revokeObjectURL(item.mediaUrl));
        return [];
      });
    },
    [],
  );

  const sendOne = useCallback(async (clientTempId: string) => {
    const file = files.current.get(clientTempId);
    if (!file) return;
    try {
      const message = await latest.current.upload(file, clientTempId);
      latest.current.commit(message);
      files.current.delete(clientTempId);
      setPending((items) => {
        const item = items.find((p) => p.clientTempId === clientTempId);
        // Превью держим ещё немного, чтобы настоящая картинка успела загрузиться.
        if (item) window.setTimeout(() => URL.revokeObjectURL(item.mediaUrl), 30_000);
        return items.filter((p) => p.clientTempId !== clientTempId);
      });
    } catch (error) {
      setPending((items) =>
        items.map((p) =>
          p.clientTempId === clientTempId
            ? {
                ...p,
                status: "failed",
                ...(error instanceof Error ? { errorMessage: error.message } : {}),
              }
            : p,
        ),
      );
    }
    await wait(SEND_PAUSE_MS);
  }, []);

  const enqueue = useCallback((task: () => Promise<unknown>) => {
    chain.current = chain.current.then(task, task);
    return chain.current;
  }, []);

  const sendPhotos = useCallback(
    (photos: PreparedMedia[], afterAll?: () => void) => {
      const now = Date.now();
      const created = photos.map((media, index) => {
        const clientTempId = crypto.randomUUID();
        files.current.set(clientTempId, media.file);
        return {
          id: `tmp-${clientTempId}`,
          clientTempId,
          authorId,
          createdAt: new Date(now + index).toISOString(),
          kind: "image" as const,
          text: "Фото",
          mediaUrl: media.previewUrl,
          mediaMime: media.file.type,
          status: "sending" as const,
        };
      });
      setPending((items) => [...items, ...created]);
      for (const item of created) void enqueue(() => sendOne(item.clientTempId));
      if (afterAll) void enqueue(async () => afterAll());
    },
    [authorId, enqueue, sendOne],
  );

  const retry = useCallback(
    (clientTempId: string) => {
      if (!files.current.has(clientTempId)) return false;
      setPending((items) =>
        items.map((p) => (p.clientTempId === clientTempId ? { ...p, status: "sending" } : p)),
      );
      void enqueue(() => sendOne(clientTempId));
      return true;
    },
    [enqueue, sendOne],
  );

  return { pending, sendPhotos, retry };
}

/** Убираем из ожидающих те, что уже пришли по сети (например, через WebSocket). */
export function withPending<T extends { clientTempId?: string | undefined }>(
  messages: readonly T[],
  pending: readonly PendingPhoto[],
): (T | PendingPhoto)[] {
  const arrived = new Set(messages.map((m) => m.clientTempId).filter(Boolean));
  return [...messages, ...pending.filter((p) => !arrived.has(p.clientTempId))];
}
