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


/** Обсуждение конкретного материала доски. */
export type BoardReaction = 'like' | 'thanks' | 'idea' | 'question';

export interface BoardComment {
  id: string;
  postId: string;
  authorId: string | null;
  authorName: string;
  parentId: string | null;
  text: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  clientTempId: string;
}

export interface BoardReactionCount {
  reaction: BoardReaction;
  count: number;
  mine: boolean;
}

export interface BoardDiscussionResponse {
  items: BoardComment[];
  hasMore: boolean;
  nextBefore: string | null;
  commentsClosed: boolean;
  canComment: boolean;
  canModerate: boolean;
  reactions: BoardReactionCount[];
}

export interface BoardCommentInput {
  text: string;
  clientTempId: string;
  parentId?: string;
}
