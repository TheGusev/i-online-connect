import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { WS_URL, getToken, notificationsApi } from "@/api";
import type { AppNotification, NotificationFeed } from "@/api";
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
 * подтягиваем свежий список.
 */
export function useNotificationSocket() {
  const authed = useSessionStore((state) => state.status === "authed");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authed || !WS_URL) return;
    const token = getToken();
    if (!token) return;

    let closed = false;
    const socket = new WebSocket(`${WS_URL}/notifications?token=${encodeURIComponent(token)}`);
    // Соединение открывается асинхронно: если эффект уже снят, закрываем
    // сразу после открытия — иначе браузер ругается на разрыв рукопожатия.
    socket.onopen = () => {
      if (closed) socket.close();
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type?: string;
          notification?: AppNotification;
        };
        if (payload.type !== "notification" || !payload.notification) return;
        const incoming = payload.notification;
        queryClient.setQueryData<NotificationFeed>(notificationsQueryKey, (previous) => {
          if (!previous) return previous;
          if (previous.items.some((item) => item.id === incoming.id)) return previous;
          return {
            unreadCount: previous.unreadCount + 1,
            items: [incoming, ...previous.items],
          };
        });
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      } catch (cause) {
        console.error("[notifications] некорректное событие:", cause);
      }
    };

    return () => {
      closed = true;
      if (socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [authed, queryClient]);
}

/** Человеческий текст уведомления и ссылка на объявление. */
export function describeNotification(notification: AppNotification): {
  title: string;
  listingId: string | null;
} {
  const payload = notification.payload ?? {};
  const listingTitle = typeof payload["title"] === "string" ? payload["title"] : "объявление";
  const listingId = typeof payload["listingId"] === "string" ? payload["listingId"] : null;

  if (notification.kind === "listing_response") {
    return { title: `Новый отклик на «${listingTitle}»`, listingId };
  }
  if (notification.kind === "listing_match") {
    return { title: `Рядом появилось: «${listingTitle}»`, listingId };
  }
  return { title: listingTitle, listingId };
}
