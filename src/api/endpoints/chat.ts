import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { Conversation, Message } from "../types";

export async function getConversations(): Promise<Conversation[]> {
  return USE_MOCK ? mockApi.conversations() : request<Conversation[]>("/chat/conversations");
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return USE_MOCK
    ? mockApi.messages(conversationId)
    : request<Message[]>(`/chat/conversations/${conversationId}/messages`);
}

export async function sendMessage(conversationId: string, text: string): Promise<Message> {
  if (USE_MOCK) {
    return {
      id: `local-${Date.now()}`,
      conversationId,
      authorId: "me",
      text,
      createdAt: new Date().toISOString(),
    };
  }
  return request<Message>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { text },
  });
}
