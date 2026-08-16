import { useQuery } from "@tanstack/react-query";

import { chatApi } from "@/api";

export const conversationsQueryOptions = {
  queryKey: ["chat", "conversations"] as const,
  queryFn: () => chatApi.getConversations(),
};

export function useConversations() {
  return useQuery(conversationsQueryOptions);
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["chat", "messages", conversationId] as const,
    queryFn: () => chatApi.getMessages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}
