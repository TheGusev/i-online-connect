import { USE_MOCKS, request } from "../client";
import { mockApi } from "../mocks";
import type { Conversation, MeetingKind, Message } from "../types";

export async function getConversations(): Promise<Conversation[]> {
  return USE_MOCKS ? mockApi.conversations() : request<Conversation[]>("/chat/conversations");
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  return USE_MOCKS
    ? mockApi.conversation(conversationId)
    : request<Conversation>(`/chat/conversations/${conversationId}`);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return USE_MOCKS
    ? mockApi.messages(conversationId)
    : request<Message[]>(`/chat/conversations/${conversationId}/messages`);
}

/** Варианты стартовой фразы от AI на основе совпадающих интересов. */
export async function getMessageStarters(conversationId: string): Promise<string[]> {
  return USE_MOCKS
    ? mockApi.messageStarters(conversationId)
    : request<string[]>(`/chat/conversations/${conversationId}/starters`);
}

export async function sendMessage(conversationId: string, text: string): Promise<Message> {
  return USE_MOCKS
    ? mockApi.sendMessage(conversationId, text)
    : request<Message>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { text },
      });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  if (USE_MOCKS) return mockApi.markConversationRead(conversationId);
  await request<void>(`/chat/conversations/${conversationId}/read`, { method: "POST" });
}

export async function suggestMeeting(
  conversationId: string,
  kind: MeetingKind,
  text: string,
): Promise<Message> {
  return USE_MOCKS
    ? mockApi.suggestMeeting(conversationId, kind, text)
    : request<Message>(`/chat/conversations/${conversationId}/meetings`, {
        method: "POST",
        body: { kind, text },
      });
}
