import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { getToken, notificationsApi } from "@/api";
import type { AppNotification, NotificationFeed } from "@/api";
import { resolveWsUrl } from "@/features/chat/useChatSocket";
import { useSessionStore } from "@/store/useSessionStore";

export const notificationsQueryKey = ["notifications"] as const;

export type NotificationFilter = "chats" | "meetings" | "matches";

export function useNotifications(limit = 20) {
  const authed = useSessionStore((state) => state.status === "authed");
  return useQuery({
    queryKey: [...notificationsQueryKey, "recent", limit],
    queryFn: () => notificationsApi.getNotifications({ limit }),
    enabled: authed,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationHistory(type?: NotificationFilter) {
  const authed = useSessionStore((state) => state.status === "authed");
  const query = useInfiniteQuery({
    queryKey: [...notificationsQueryKey, "history", type ?? "all"],
    queryFn: ({ pageParam }) =>
      notificationsApi.getNotifications({ limit: 30, type, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: authed,
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.items) ?? [] };
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markNotificationsRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}

/**
 * Живая доставка уведомлений: ws(s)://host/ws/notifications?token=...
 * Канал только для чтения — пришедшее событие подмешиваем в кэш и
 * подтягиваем свежий список. При обрыве переподключаемся с нарастающей паузой.
 */
export function useNotificationSocket() {
  const authed = useSessionStore((state) => state.status === "authed");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authed || typeof window === "undefined") return;
    const base = resolveWsUrl();
    if (!base) return;

    let disposed = false;
    let attempt = 0;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handle = (incoming: AppNotification) => {
      queryClient.setQueriesData<NotificationFeed>({ queryKey: notificationsQueryKey }, (previous) => {
        if (!previous || previous.items.some((item) => item.id === incoming.id)) return previous;
        return { ...previous, unreadCount: previous.unreadCount + 1, items: [incoming, ...previous.items] };
      });
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });

      if (incoming.kind === "new_message" || incoming.kind === "match") {
        void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] });
        const { title, href, conversationId } = describeNotification(incoming);
        const inThatChat =
          conversationId && window.location.pathname === `/chat/${conversationId}`;
        if (!inThatChat) {
          const preview =
            typeof incoming.payload?.["preview"] === "string"
              ? (incoming.payload["preview"] as string)
              : undefined;
          toast(title, {
            description: preview,
            action: href
              ? {
                  label: "Открыть",
                  onClick: () => {
                     window.location.assign(href);
                  },
                }
              : undefined,
          });
        }
      } else if (incoming.kind === "space_event") {
        const { title, href } = describeNotification(incoming);
        toast(title, {
          action: href ? { label: "Открыть", onClick: () => window.location.assign(href) } : undefined,
        });
      }
    };

    const connect = () => {
      if (disposed) return;
      const token = getToken();
      if (!token) return;
      socket = new WebSocket(`${base}/notifications?token=${encodeURIComponent(token)}`);
      socket.onopen = () => {
        attempt = 0;
        if (disposed) socket?.close();
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            notification?: AppNotification;
          };
          if (payload.type !== "notification" || !payload.notification) return;
          handle(payload.notification);
        } catch (cause) {
          console.error("[notifications] некорректное событие:", cause);
        }
      };
      socket.onclose = (event) => {
        socket = null;
        if (disposed || event.code === 4403) return;
        const delay = Math.min(15_000, 1000 * 2 ** attempt);
        attempt += 1;
        timer = setTimeout(connect, delay);
      };
    };

    connect();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !socket && !disposed) {
        if (timer) clearTimeout(timer);
        attempt = 0;
        connect();
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
        void queryClient.invalidateQueries({ queryKey: ["chat"] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      if (timer) clearTimeout(timer);
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [authed, queryClient]);
}

/** Человеческий текст уведомления и ссылка (объявление или диалог). */
export function describeNotification(notification: AppNotification): {
  title: string;
  description: string | null;
  href: string | null;
  listingId: string | null;
  conversationId: string | null;
  profileId: string | null;
  spaceId: string | null;
  eventId: string | null;
} {
  const payload = notification.payload ?? {};
  const str = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);
  const listingTitle = str("title") ?? "объявление";
  const listingId = str("listingId");
  const conversationId = str("conversationId");
  const profileId = str("withId");
  const spaceId = str("spaceId");
  const eventId = str("eventId");

  const result = (title: string, description: string | null, href: string | null) => ({
    title,
    description,
    href,
    listingId,
    conversationId,
    profileId,
    spaceId,
    eventId,
  });

  if (notification.kind === "listing_response") {
    return result(`Новый отклик на «${listingTitle}»`, null, listingId ? `/nearby/${listingId}` : null);
  }
  if (notification.kind === "listing_match") {
    return result(`Рядом появилось: «${listingTitle}»`, null, listingId ? `/nearby/${listingId}` : null);
  }
  if (notification.kind === "new_message") {
    return result(
      `Новое сообщение от ${str("fromName") ?? "собеседника"}`,
      str("preview"),
      conversationId ? `/chat/${conversationId}` : null,
    );
  }
  if (notification.kind === "match") {
    return result(
      `Совпадение! Вы понравились друг другу с ${str("withName") ?? "новым человеком"}`,
      "Откройте профиль и начните разговор.",
      profileId ? `/profile/${profileId}` : conversationId ? `/chat/${conversationId}` : null,
    );
  }
  if (notification.kind === "space_event") {
    const href = spaceId
      ? `/spaces/${spaceId}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`
      : null;
    return result(
      `Новая встреча в «${str("spaceTitle") ?? "Пространстве"}»`,
      [str("title"), str("place")].filter(Boolean).join(" · ") || null,
      href,
    );
  }
  return result(listingTitle, null, listingId ? `/nearby/${listingId}` : null);
}
