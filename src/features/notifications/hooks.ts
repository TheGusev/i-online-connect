import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { getToken, notificationsApi } from "@/api";
import type { AppNotification, NotificationFeed } from "@/api";
import { resolveWsUrl } from "@/features/chat/useChatSocket";
import { useSessionStore } from "@/store/useSessionStore";

export const notificationsQueryKey = ["notifications"] as const;

export function useNotifications() {
  const authed = useSessionStore((state) => state.status === "authed");
  return useQuery({
    queryKey: notificationsQueryKey,
    queryFn: () => notificationsApi.getNotifications({ limit: 20 }),
    enabled: authed,
    refetchOnWindowFocus: true,
  });
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
      queryClient.setQueryData<NotificationFeed>(notificationsQueryKey, (previous) => {
        if (!previous) return previous;
        if (previous.items.some((item) => item.id === incoming.id)) return previous;
        return {
          unreadCount: previous.unreadCount + 1,
          items: [incoming, ...previous.items],
        };
      });
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });

      if (incoming.kind === "new_message" || incoming.kind === "match") {
        void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] });
        const { title, conversationId } = describeNotification(incoming);
        const inThatChat =
          conversationId && window.location.pathname === `/chat/${conversationId}`;
        if (!inThatChat) {
          const preview =
            typeof incoming.payload?.["preview"] === "string"
              ? (incoming.payload["preview"] as string)
              : undefined;
          toast(title, {
            description: preview,
            action: conversationId
              ? {
                  label: "Открыть",
                  onClick: () => {
                    window.location.assign(`/chat/${conversationId}`);
                  },
                }
              : undefined,
          });
        }
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
  listingId: string | null;
  conversationId: string | null;
} {
  const payload = notification.payload ?? {};
  const str = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);
  const listingTitle = str("title") ?? "объявление";
  const listingId = str("listingId");
  const conversationId = str("conversationId");

  if (notification.kind === "listing_response") {
    return { title: `Новый отклик на «${listingTitle}»`, listingId, conversationId: null };
  }
  if (notification.kind === "listing_match") {
    return { title: `Рядом появилось: «${listingTitle}»`, listingId, conversationId: null };
  }
  if (notification.kind === "new_message") {
    return {
      title: `Новое сообщение от ${str("fromName") ?? "собеседника"}`,
      listingId: null,
      conversationId,
    };
  }
  if (notification.kind === "match") {
    return {
      title: `Совпадение! Вы понравились друг другу с ${str("withName") ?? "новым человеком"}`,
      listingId: null,
      conversationId,
    };
  }
  return { title: listingTitle, listingId, conversationId };
}
