import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { chatApi } from "@/api";
import type { MeetingKind, Message, MessageQuote } from "@/api";
import type { VoiceRecording } from "@/features/chat/useVoiceRecorder";
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
        const idx = items.findIndex(
          (m) =>
            m.id === message.id ||
            (replaceId && m.id === replaceId) ||
            (message.clientTempId && m.clientTempId === message.clientTempId),
        );
        if (idx === -1) return [...items.filter((m) => m.id !== message.id), message];
        const next = items.slice();
        next[idx] = { ...next[idx], ...message };
        return next.filter((item, itemIndex) => itemIndex === idx || item.id !== message.id);
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

/** Оптимистичная отправка: пузырь появляется сразу со статусом «отправляется». */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const cache = useMessagesCache(conversationId);
  const myId = useSessionStore((s) => s.user?.id ?? "me");

  return useMutation({
    mutationFn: ({
      text,
      clientTempId,
      replyTo,
    }: {
      text: string;
      clientTempId: string;
      retryId?: string;
      replyTo?: MessageQuote | undefined;
    }) => chatApi.sendMessage(conversationId, text, clientTempId, replyTo?.id),
    onMutate: ({ text, clientTempId, retryId, replyTo }) => {
      const id = retryId ?? `tmp-${clientTempId}`;
      cache.upsert({
        id,
        clientTempId,
        conversationId,
        authorId: myId,
        text,
        kind: "text",
        createdAt: new Date().toISOString(),
        status: "sending",
        ...(replyTo ? { replyToId: replyTo.id, replyTo } : {}),
      });
      return { id };
    },
    onSuccess: (message, _vars, ctx) => {
      cache.upsert({ ...message, status: message.status ?? "sent" }, ctx?.id);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversationId] });
    },
    onError: (error, vars, ctx) => {
      if (!ctx) return;
      cache.upsert({
        id: ctx.id,
        clientTempId: vars.clientTempId,
        conversationId,
        authorId: myId,
        text: vars.text,
        kind: "text",
        createdAt: new Date().toISOString(),
        status: "failed",
        ...(vars.replyTo ? { replyToId: vars.replyTo.id, replyTo: vars.replyTo } : {}),
        ...(error instanceof Error ? { errorMessage: error.message } : {}),
      });
    },
  });
}


/** Голосовое проходит через тот же optimistic cache и статусы, что текст. */
export function useSendVoiceMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const cache = useMessagesCache(conversationId);
  const myId = useSessionStore((s) => s.user?.id ?? "me");

  return useMutation({
    mutationFn: ({
      recording,
      clientTempId,
      replyTo,
    }: {
      recording: VoiceRecording;
      clientTempId: string;
      replyTo?: MessageQuote | undefined;
    }) =>
      chatApi.sendVoiceMessage(
        conversationId,
        recording.blob,
        recording.durationMs,
        clientTempId,
        replyTo?.id,
      ),
    onMutate: ({ recording, clientTempId, replyTo }) => {
      const id = `tmp-${clientTempId}`;
      const previewUrl = URL.createObjectURL(recording.blob);
      cache.upsert({
        id,
        clientTempId,
        conversationId,
        authorId: myId,
        text: "Голосовое сообщение",
        kind: "voice",
        mediaUrl: previewUrl,
        mediaMime: recording.mimeType,
        durationMs: recording.durationMs,
        createdAt: new Date().toISOString(),
        status: "sending",
        ...(replyTo ? { replyToId: replyTo.id, replyTo } : {}),
      });
      return { id, previewUrl };
    },
    onSuccess: (message, _vars, ctx) => {
      if (ctx?.previewUrl) URL.revokeObjectURL(ctx.previewUrl);
      cache.upsert({ ...message, status: message.status ?? "sent" }, ctx?.id);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (error, vars, ctx) => {
      if (!ctx) return;
      URL.revokeObjectURL(ctx.previewUrl);
      cache.upsert({
        id: ctx.id,
        clientTempId: vars.clientTempId,
        conversationId,
        authorId: myId,
        text: "Голосовое сообщение",
        kind: "voice",
        durationMs: vars.recording.durationMs,
        createdAt: new Date().toISOString(),
        status: "failed",
        ...(vars.replyTo ? { replyToId: vars.replyTo.id, replyTo: vars.replyTo } : {}),
        ...(error instanceof Error ? { errorMessage: error.message } : {}),
      });
    },
  });
}

/** Правка своего текста: пузырь обновляется сразу, при ошибке возвращается прежний. */
export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const cache = useMessagesCache(conversationId);

  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string; previous: Message }) =>
      chatApi.editMessage(conversationId, messageId, text),
    onMutate: ({ messageId, text, previous }) => {
      cache.upsert({ ...previous, id: messageId, text, editedAt: new Date().toISOString() });
    },
    onSuccess: (message) => {
      cache.upsert({ ...message, status: message.status ?? "sent" });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (_error, vars) => {
      cache.upsert(vars.previous);
    },
  });
}

/** Удаление своего сообщения: на месте остаётся пометка «Сообщение удалено». */
export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const cache = useMessagesCache(conversationId);

  return useMutation({
    mutationFn: ({ messageId }: { messageId: string; previous: Message }) =>
      chatApi.deleteMessage(conversationId, messageId),
    onMutate: ({ messageId, previous }) => {
      cache.upsert({
        ...previous,
        id: messageId,
        text: "",
        deletedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (_error, vars) => {
      cache.upsert(vars.previous);
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
