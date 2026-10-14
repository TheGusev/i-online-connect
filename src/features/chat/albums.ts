/**
 * Группировка подряд идущих фото одного автора в альбом — только на стороне показа.
 * Работает одинаково для истории, новых сообщений по сети и оптимистичных плиток.
 */
export const ALBUM_GAP_MS = 15_000;

export interface AlbumCandidate {
  id: string;
  authorId: string;
  createdAt: string;
  kind?: string | undefined;
  mediaUrl?: string | undefined;
  deletedAt?: string | undefined;
  replyToId?: string | undefined;
}

export type MessageGroup<T> =
  | { type: "single"; message: T }
  | { type: "album"; messages: T[] };

/** Фото, которое может войти в альбом: не удалено и не является ответом на сообщение. */
function albumable(message: AlbumCandidate) {
  return message.kind === "image" && !message.deletedAt && !message.replyToId;
}

export function groupMessages<T extends AlbumCandidate>(messages: readonly T[]): MessageGroup<T>[] {
  const groups: MessageGroup<T>[] = [];
  let album: T[] | null = null;

  const flush = () => {
    if (!album) return;
    const first = album[0]!;
    groups.push(album.length > 1 ? { type: "album", messages: album } : { type: "single", message: first });
    album = null;
  };

  for (const message of messages) {
    if (!albumable(message)) {
      flush();
      groups.push({ type: "single", message });
      continue;
    }
    const last = album ? album[album.length - 1] : undefined;
    const gap = last ? Date.parse(message.createdAt) - Date.parse(last.createdAt) : Infinity;
    if (album && last && last.authorId === message.authorId && Math.abs(gap) <= ALBUM_GAP_MS) {
      album.push(message);
    } else {
      flush();
      album = [message];
    }
  }
  flush();
  return groups;
}

/** Стабильный ключ плитки: оптимистичная и настоящая версия одного фото совпадают. */
export const tileKey = (message: { id: string; clientTempId?: string | undefined }) =>
  message.clientTempId ?? message.id;
