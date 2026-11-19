import { request, upload } from '@/api/client';

import type {
  BoardComment,
  BoardCommentInput,
  BoardDiscussionResponse,
  BoardListResponse,
  BoardPost,
  BoardReaction,
} from './types';

const base = (spaceId: string) => `/spaces/${encodeURIComponent(spaceId)}/board`;

const postBase = (spaceId: string, postId: string) =>
  `${base(spaceId)}/${encodeURIComponent(postId)}`;

export const boardApi = {
  discussion: (
    spaceId: string,
    postId: string,
    before?: string,
    signal?: AbortSignal,
  ) => {
    const suffix = before
      ? `?before=${encodeURIComponent(before)}`
      : '';
    return request<BoardDiscussionResponse>(
      `${postBase(spaceId, postId)}/discussion${suffix}`,
      signal ? { signal } : {},
    );
  },
  addComment: (
    spaceId: string,
    postId: string,
    body: BoardCommentInput,
  ) =>
    request<BoardComment>(
      `${postBase(spaceId, postId)}/comments`,
      { method: 'POST', body },
    ),
  editComment: (
    spaceId: string,
    postId: string,
    commentId: string,
    text: string,
  ) =>
    request<BoardComment>(
      `${postBase(spaceId, postId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'PATCH', body: { text } },
    ),
  deleteComment: (
    spaceId: string,
    postId: string,
    commentId: string,
  ) =>
    request<BoardComment>(
      `${postBase(spaceId, postId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' },
    ),
  setReaction: (
    spaceId: string,
    postId: string,
    reaction: BoardReaction | null,
  ) =>
    request<{ ok: true }>(
      `${postBase(spaceId, postId)}/reaction`,
      { method: 'PUT', body: { reaction } },
    ),
  setCommentsClosed: (
    spaceId: string,
    postId: string,
    closed: boolean,
  ) =>
    request<{ commentsClosed: boolean }>(
      `${postBase(spaceId, postId)}/discussion`,
      { method: 'PATCH', body: { closed } },
    ),
  list: (spaceId: string, signal?: AbortSignal) =>
    request<BoardListResponse>(base(spaceId), signal ? { signal } : {}),
  addJson: (spaceId: string, body: Record<string, unknown>) =>
    request<BoardPost>(base(spaceId), { method: 'POST', body }),
  addPhoto: (spaceId: string, file: File, clientTempId: string, text?: string) => {
    const form = new FormData();
    form.append('kind', 'photo');
    form.append('clientTempId', clientTempId);
    if (text) form.append('text', text);
    form.append('file', file);
    return upload<BoardPost>(base(spaceId), form);
  },
  update: (spaceId: string, postId: string, body: { status?: 'open' | 'resolved'; pinned?: boolean }) =>
    request<BoardPost>(`${base(spaceId)}/${encodeURIComponent(postId)}`, { method: 'PATCH', body }),
  remove: (spaceId: string, postId: string) =>
    request<{ ok: true; id: string }>(`${base(spaceId)}/${encodeURIComponent(postId)}`, { method: 'DELETE' }),
  markRead: (spaceId: string) => request<{ ok: true }>(`${base(spaceId)}/read`, { method: 'POST', body: {} }),
  news: () => request<{ ids: string[] }>('/spaces/news'),
};
