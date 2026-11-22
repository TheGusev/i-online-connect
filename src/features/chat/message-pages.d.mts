export interface MessageIdentity {
  id: string;
  authorId: string;
  conversationId: string;
  clientTempId?: string | null | undefined;
}
export interface MessagePosition {
  pageIndex: number;
  index: number;
  beforeId: string | null;
  afterId: string | null;
}
export function upsertMessagePages<T extends MessageIdentity, P extends { items: T[] }>(pages: P[], message: T, replaceId?: string): P[];
export function captureMessagePosition<T extends { id: string }>(pages: { items: T[] }[], id: string): MessagePosition | null;
export function removeMessagePages<T extends { id: string }, P extends { items: T[] }>(pages: P[], id: string): P[];
export function restoreMessagePages<T extends MessageIdentity, P extends { items: T[] }>(pages: P[], message: T, position: MessagePosition | null | undefined): P[];
