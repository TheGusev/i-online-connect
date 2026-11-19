import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useSessionStore } from '@/store/useSessionStore';

import { boardApi } from './api';
import type {
  BoardAddInput,
  BoardCommentInput,
  BoardListResponse,
  BoardPost,
  BoardReaction,
} from './types';

export const boardKey = (spaceId: string) => ['space-board', spaceId] as const;
export const NEWS_KEY = ['spaces', 'news'] as const;

/** Текущее время, обновляется раз в минуту: по нему карточки уходят с поля на полку. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useBoard(spaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: boardKey(spaceId),
    queryFn: ({ signal }) => boardApi.list(spaceId, signal),
    enabled,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useAddPost(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<BoardPost, Error, BoardAddInput>({
    mutationFn: (input) => {
      const clientTempId = crypto.randomUUID();
      if (input.kind === 'photo') return boardApi.addPhoto(spaceId, input.file, clientTempId, input.text);
      if (input.kind === 'link') {
        return boardApi.addJson(spaceId, {
          kind: 'link',
          url: input.url,
          clientTempId,
          ...(input.text ? { text: input.text } : {}),
        });
      }
      return boardApi.addJson(spaceId, { kind: input.kind, text: input.text, clientTempId });
    },
    onSuccess: (post) => {
      queryClient.setQueryData<BoardListResponse>(boardKey(spaceId), (previous) => {
        if (!previous) return { posts: [post], retentionDays: 90 };
        if (previous.posts.some((item) => item.id === post.id)) return previous;
        return { ...previous, posts: [post, ...previous.posts] };
      });
    },
  });
}

export function useUpdatePost(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<BoardPost, Error, { postId: string; status?: 'open' | 'resolved'; pinned?: boolean }>({
    mutationFn: ({ postId, ...body }) => boardApi.update(spaceId, postId, body),
    onSuccess: (post) => {
      queryClient.setQueryData<BoardListResponse>(boardKey(spaceId), (previous) =>
        previous ? { ...previous, posts: previous.posts.map((item) => (item.id === post.id ? post : item)) } : previous,
      );
    },
  });
}

export function useDeletePost(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true; id: string }, Error, string>({
    mutationFn: (postId) => boardApi.remove(spaceId, postId),
    onSuccess: (_result, postId) => {
      queryClient.setQueryData<BoardListResponse>(boardKey(spaceId), (previous) =>
        previous ? { ...previous, posts: previous.posts.filter((item) => item.id !== postId) } : previous,
      );
    },
  });
}

/** Открытая доска считается прочитанной: звезда в списке гаснет. Срабатывает и на новые карточки. */
export function useMarkBoardRead(spaceId: string, enabled: boolean, latestId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void boardApi
      .markRead(spaceId)
      .then(() => {
        if (!cancelled) void queryClient.invalidateQueries({ queryKey: NEWS_KEY });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [spaceId, enabled, latestId, queryClient]);
}

/** Сообщества, где есть непрочитанные карточки или встречи от других участников. */
export function useSpacesNews() {
  const status = useSessionStore((state) => state.status);
  return useQuery({
    queryKey: NEWS_KEY,
    queryFn: () => boardApi.news(),
    enabled: status === 'authed',
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    select: (data) => data.ids,
  });
}


export const discussionKey = (
  spaceId: string,
  postId: string | null,
) => ['space-board-discussion', spaceId, postId] as const;

/** Страницы идут от новых к старым; внутри страницы — по времени вперёд. */
export function usePostDiscussion(
  spaceId: string,
  postId: string | null,
) {
  return useInfiniteQuery({
    queryKey: discussionKey(spaceId, postId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (!postId) {
        throw new Error('Материал не выбран');
      }
      return boardApi.discussion(
        spaceId,
        postId,
        pageParam ?? undefined,
        signal,
      );
    },
    getNextPageParam: (page) =>
      page.hasMore && page.nextBefore
        ? page.nextBefore
        : undefined,
    enabled: Boolean(spaceId && postId),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    retry: false,
  });
}

export function useAddComment(spaceId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BoardCommentInput) =>
      boardApi.addComment(spaceId, postId, body),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: discussionKey(spaceId, postId),
      }),
  });
}

export function useSetPostReaction(
  spaceId: string,
  postId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reaction: BoardReaction | null) =>
      boardApi.setReaction(spaceId, postId, reaction),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: discussionKey(spaceId, postId),
      }),
  });
}

export function useSetCommentsClosed(
  spaceId: string,
  postId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (closed: boolean) =>
      boardApi.setCommentsClosed(spaceId, postId, closed),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: discussionKey(spaceId, postId),
      }),
  });
}


export function useEditComment(spaceId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { commentId: string; text: string }) =>
      boardApi.editComment(
        spaceId,
        postId,
        input.commentId,
        input.text,
      ),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: discussionKey(spaceId, postId),
      }),
  });
}

export function useDeleteComment(spaceId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      boardApi.deleteComment(spaceId, postId, commentId),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: discussionKey(spaceId, postId),
      }),
  });
}
