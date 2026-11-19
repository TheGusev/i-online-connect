import { request, upload } from '@/api/client';

import type { BoardListResponse, BoardPost } from './types';

const base = (spaceId: string) => `/spaces/${encodeURIComponent(spaceId)}/board`;

export const boardApi = {
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
