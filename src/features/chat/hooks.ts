import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { chatApi } from "@/api";
import type { MeetingKind, Message } from "@/api";

export const conversationsQueryOptions = {
  queryKey: ["chat", "conversations"] as const,
  queryFn: () => chatApi.getConversations(),
};

export function useConversations() {
  return useQuery(conversationsQueryOptions);
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: ["chat", "conversation", conversationId] as const,
    queryFn: () => chatApi.getConversation(conversationId),
  });
}

export function messagesQueryKey(conversationId: string | null) {
  return ["chat", "messages", conversationId] as const;
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesQueryKey(conversationId),
    queryFn: () => chatApi.getMessages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

/** Подсказки первой фразы нужны только для пустого диалога. */
export function useMessageStarters(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "starters", conversationId] as const,
    queryFn: () => chatApi.getMessageStarters(conversationId),
    enabled,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => chatApi.sendMessage(conversationId, text),
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), (previous) => [
        ...(previous ?? []),
        message,
      ]);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversationId] });
    },
  });
}

export function useSuggestMeeting(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, text }: { kind: MeetingKind; text: string }) =>
      chatApi.suggestMeeting(conversationId, kind, text),
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), (previous) => [
        ...(previous ?? []),
        message,
      ]);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });
}

export function useMarkConversationRead(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.markConversationRead(conversationId as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });
}
