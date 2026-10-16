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

const near = (a: AlbumCandidate, b: AlbumCandidate | undefined) =>
  Boolean(b) && b!.kind === "image" && !b!.replyToId && b!.authorId === a.authorId &&
  Math.abs(Date.parse(a.createdAt) - Date.parse(b!.createdAt)) <= ALBUM_GAP_MS;

/**
 * Удалённое фото из альбома скрывается целиком, если рядом осталось живое фото
 * того же альбома, — раскладка пересчитывается, одно оставшееся фото становится обычным.
 * Цепочка соседних удалённых фото тоже скрывается, пока она касается живого.
 */
export function hideDeletedAlbumPhotos<T extends AlbumCandidate>(messages: readonly T[]): T[] {
  const deletedPhoto = (m: AlbumCandidate | undefined) => Boolean(m && m.kind === "image" && m.deletedAt && !m.replyToId);
  const hidden = new Set<number>();
  messages.forEach((m, i) => {
    if (!deletedPhoto(m)) return;
    for (const dir of [-1, 1]) {
      let j = i + dir;
      let prev: AlbumCandidate = m;
      while (j >= 0 && j < messages.length && near(prev, messages[j])) {
        if (albumable(messages[j]!)) { hidden.add(i); return; }
        prev = messages[j]!;
        j += dir;
      }
    }
  });
  return messages.filter((_, i) => !hidden.has(i));
}

/** Раскладка плиток по числу видимых фото: 2 рядом, 3 — большое слева, 4+ — сетка 2×2. */
export function albumLayout(count: number) {
  const visible = Math.min(count, 4);
  if (visible === 2) return { visible, rest: 0, grid: "grid-cols-2 aspect-[2/1]", big: -1 };
  if (visible === 3) return { visible, rest: 0, grid: "grid-cols-2 grid-rows-2 aspect-square", big: 0 };
  return { visible, rest: Math.max(0, count - 4), grid: "grid-cols-2 grid-rows-2 aspect-square", big: -1 };
}

export function groupMessages<T extends AlbumCandidate>(input: readonly T[]): MessageGroup<T>[] {
  const messages = hideDeletedAlbumPhotos(input);
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
