import { request } from '@/api/client';

export interface PersonResult {
  id: string;
  name: string;
  city: string;
  avatarUrl: string | null;
  canMessage: boolean;
}
export interface PersonalInvite {
  id: string;
  token: string;
  expiresAt: string;
}
export const contactsApi = {
  search: (q: string, signal?: AbortSignal) => request<{ items: PersonResult[] }>('/contacts/search', { query: { q }, ...(signal ? { signal } : {}) }),
  create: () => request<PersonalInvite>('/contacts/invites', { method: 'POST' }),
  preview: (token: string) => request<{ inviterName: string; inviterAvatarUrl: string | null }>('/contacts/invites/preview', { method: 'POST', body: { token } }),
  accept: (token: string) => request<{ conversationId: string; created: boolean }>('/contacts/invites/accept', { method: 'POST', body: { token } }),
  revoke: (id: string) => request<void>(`/contacts/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
