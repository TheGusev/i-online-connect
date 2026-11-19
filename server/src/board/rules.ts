/** Чистые правила доски сообщества (без базы и файловой системы). */
import { normalizeLinkUrl, type LiveCardKind } from '../live/cards.ts';

/** Сколько дней карточка хранится: потом удаляется вместе с файлом. */
export const BOARD_RETENTION_DAYS = 90;
export const BOARD_LIST_LIMIT = 150;
/** Сколько карточек один участник может положить в сообщество за сутки. */
export const BOARD_DAILY_LIMIT = 30;
export const BOARD_MAX_PINNED = 2;

export type BoardPostStatus = 'open' | 'resolved';

export interface BoardPostRow {
  id: string;
  kind: LiveCardKind;
  author_id: string;
  author_name: string;
  text: string;
  url: string | null;
  media_url: string | null;
  media_mime: string | null;
  status: BoardPostStatus;
  pinned_at: Date | string | null;
  created_at: Date | string;
  client_temp_id: string;
}

export interface BoardPostDto {
  id: string;
  kind: LiveCardKind;
  authorId: string;
  authorName: string;
  text: string;
  url?: string;
  domain?: string;
  mediaUrl?: string;
  mediaMime?: string;
  status: BoardPostStatus;
  pinned: boolean;
  createdAt: string;
  clientTempId: string;
}

export function toBoardPostDto(row: BoardPostRow): BoardPostDto {
  const dto: BoardPostDto = {
    id: row.id,
    kind: row.kind,
    authorId: row.author_id,
    authorName: row.author_name,
    text: row.text,
    status: row.status,
    pinned: row.pinned_at !== null && row.pinned_at !== undefined,
    createdAt: new Date(row.created_at).toISOString(),
    clientTempId: row.client_temp_id,
  };
  if (row.url) {
    dto.url = row.url;
    const link = normalizeLinkUrl(row.url);
    if (link.ok) dto.domain = link.value.domain;
  }
  if (row.media_url) dto.mediaUrl = row.media_url;
  if (row.media_mime) dto.mediaMime = row.media_mime;
  return dto;
}

/** Граница хранения: всё, что старше, удаляется. */
export function retentionCutoff(now: Date, days = BOARD_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Удалить или отметить вопрос может автор карточки или организатор сообщества. */
export function canManageBoardPost(userId: string, authorId: string, isHost: boolean): boolean {
  return userId === authorId || isHost;
}

/** Закреплять может только организатор. */
export function canPinBoardPost(isHost: boolean): boolean {
  return isHost;
}
