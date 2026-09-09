import { request } from "../client";
import type { Conversation, MeetingKind, Message } from "../types";

export interface MessagesPage {
  items: Message[];
  hasMore: boolean;
  /** Курсор для подгрузки более ранних сообщений (ISO-дата самого старого). */
  nextBefore: string | null;
}

export async function getConversations(): Promise<Conversation[]> {
  return request<Conversation[]>("/chat/conversations");
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  return request<Conversation>(`/chat/conversations/${conversationId}`);
}

export async function getMessages(
  conversationId: string,
  before?: string | null,
  limit = 50,
): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return request<MessagesPage>(`/chat/conversations/${conversationId}/messages?${params}`);
}

/** Сколько диалогов с непрочитанными сообщениями. */
export async function getUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>("/chat/unread-count");
}

/** Открыть (или найти существующий) диалог с человеком. */
export async function openConversation(
  participantId: string,
): Promise<{ conversationId: string; created: boolean }> {
  return request<{ conversationId: string; created: boolean }>("/chat/conversations", {
    method: "POST",
    body: { participantId },
  });
}

/** Варианты стартовой фразы от AI на основе совпадающих интересов. */
export async function getMessageStarters(conversationId: string): Promise<string[]> {
  return request<string[]>(`/chat/conversations/${conversationId}/starters`);
}

export async function sendMessage(conversationId: string, text: string): Promise<Message> {
  return request<Message>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { text },
  });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await request<void>(`/chat/conversations/${conversationId}/read`, { method: "POST" });
}

export async function suggestMeeting(
  conversationId: string,
  kind: MeetingKind,
  text: string,
): Promise<Message> {
  return request<Message>(`/chat/conversations/${conversationId}/meetings`, {
    method: "POST",
    body: { kind, text },
  });
}
