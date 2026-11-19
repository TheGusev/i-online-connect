/** Карточки доски сообщества: постоянные (в отличие от карточек эфира). */
export type BoardKind = 'photo' | 'link' | 'note' | 'question';
export type BoardStatus = 'open' | 'resolved';

export interface BoardPost {
  id: string;
  kind: BoardKind;
  authorId: string;
  authorName: string;
  text: string;
  url?: string;
  domain?: string;
  mediaUrl?: string;
  mediaMime?: string;
  status: BoardStatus;
  pinned: boolean;
  createdAt: string;
  clientTempId: string;
}

export interface BoardListResponse {
  posts: BoardPost[];
  retentionDays: number;
}

export type BoardAddInput =
  | { kind: 'note' | 'question'; text: string }
  | { kind: 'link'; url: string; text?: string }
  | { kind: 'photo'; file: File; text?: string };
