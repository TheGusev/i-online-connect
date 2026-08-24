import { request } from "../client";
import type { Conversation, MeetingKind, Message } from "../types";

export async function getConversations(): Promise<Conversation[]> {
  return request<Conversation[]>("/chat/conversations");
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  return request<Conversation>(`/chat/conversations/${conversationId}`);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return request<Message[]>(`/chat/conversations/${conversationId}/messages`);
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
