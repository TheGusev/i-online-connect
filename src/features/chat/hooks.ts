import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { chatApi } from "@/api";
import type { MeetingKind, Message } from "@/api";
import type { MessagesPage } from "@/api/endpoints/chat";
import { useSessionStore } from "@/store/useSessionStore";

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

type MessagesData = InfiniteData<MessagesPage, string | null>;

/**
 * История с подгрузкой вверх: первая страница — последние 50 сообщений,
 * fetchNextPage() тянет более ранние. `messages` — плоский список по возрастанию.
 */
export function useMessages(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: messagesQueryKey(conversationId),
    queryFn: ({ pageParam }) => chatApi.getMessages(conversationId as string, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextBefore : undefined),
    enabled: Boolean(conversationId),
  });

  // Страницы приходят «новые → старые», внутри страницы — по возрастанию.
  const messages: Message[] | undefined = query.data
    ? [...query.data.pages].reverse().flatMap((page) => page.items)
    : undefined;

  return { ...query, messages };
}

/** Точечные правки кэша сообщений без перезапроса истории. */
export function useMessagesCache(conversationId: string) {
  const queryClient = useQueryClient();
  const key = messagesQueryKey(conversationId);

  const mutate = useCallback(
    (fn: (items: Message[]) => Message[]) => {
      queryClient.setQueryData<MessagesData>(key, (previous) => {
        if (!previous) {
          return {
            pageParams: [null],
            pages: [{ items: fn([]), hasMore: false, nextBefore: null }],
          };
        }
        const [first, ...rest] = previous.pages;
        if (!first) return previous;
        return { ...previous, pages: [{ ...first, items: fn(first.items) }, ...rest] };
      });
    },
    [queryClient, key],
  );

  const upsert = useCallback(
    (message: Message, replaceId?: string) =>
      mutate((items) => {
        const idx = items.findIndex((m) => m.id === message.id || (replaceId && m.id === replaceId));
        if (idx === -1) return [...items, message];
        const next = items.slice();
        next[idx] = { ...next[idx], ...message };
        return next;
      }),
    [mutate],
  );

  const remove = useCallback(
    (id: string) => mutate((items) => items.filter((m) => m.id !== id)),
    [mutate],
  );

  /** Собеседник прочитал: все мои «отправлено» становятся «прочитано». */
  const markMineRead = useCallback(
    (myId: string) =>
      queryClient.setQueryData<MessagesData>(key, (previous) =>
        previous
          ? {
              ...previous,
              pages: previous.pages.map((page) => ({
                ...page,
                items: page.items.map((m) =>
                  m.authorId === myId && m.status === "sent" ? { ...m, status: "read" as const } : m,
                ),
              })),
            }
          : previous,
      ),
    [queryClient, key],
  );

  return { upsert, remove, markMineRead };
}

/** Подсказки первой фразы нужны только для пустого диалога. */
export function useMessageStarters(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "starters", conversationId] as const,
    queryFn: () => chatApi.getMessageStarters(conversationId),
    enabled,
  });
}

function tempId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Оптимистичная отправка: пузырь появляется сразу со статусом «отправляется». */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const cache = useMessagesCache(conversationId);
  const myId = useSessionStore((s) => s.user?.id ?? "me");

  return useMutation({
    mutationFn: ({ text }: { text: string; retryId?: string }) =>
      chatApi.sendMessage(conversationId, text),
    onMutate: ({ text, retryId }) => {
      const id = retryId ?? tempId();
      cache.upsert({
        id,
        conversationId,
        authorId: myId,
        text,
        kind: "text",
        createdAt: new Date().toISOString(),
        status: "sending",
      });
      return { id };
    },
    onSuccess: (message, _vars, ctx) => {
      cache.upsert({ ...message, status: message.status ?? "sent" }, ctx?.id);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversationId] });
    },
    onError: (_error, vars, ctx) => {
      if (!ctx) return;
      cache.upsert({
        id: ctx.id,
        conversationId,
        authorId: myId,
        text: vars.text,
        kind: "text",
        createdAt: new Date().toISOString(),
        status: "failed",
      });
    },
  });
}

export function useSuggestMeeting(conversationId: string) {
  const queryClient = useQueryClient();
  const cache = useMessagesCache(conversationId);
  return useMutation({
    mutationFn: ({ kind, text }: { kind: MeetingKind; text: string }) =>
      chatApi.suggestMeeting(conversationId, kind, text),
    onSuccess: (message) => {
      cache.upsert({ ...message, status: message.status ?? "sent" });
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
      void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Число диалогов с непрочитанными — бейдж на вкладке «Чат». */
export function useUnreadChatCount(enabled = true) {
  return useQuery({
    queryKey: ["chat", "unread-count"] as const,
    queryFn: () => chatApi.getUnreadCount(),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data) => data.count,
  });
}

/** Открыть диалог с человеком (профиль, совпадение) и получить его id. */
export function useOpenConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantId: string) => chatApi.openConversation(participantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });
}
