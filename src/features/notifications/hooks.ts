import { RESUME_EVENT } from "@/api";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { gtaToast as toast } from "./gtaToast";

import { getToken, notificationsApi } from "@/api";
import type { AppNotification, NotificationFeed } from "@/api";
import { resolveWsUrl } from "@/features/chat/useChatSocket";
import { useSessionStore } from "@/store/useSessionStore";
import { formatPrice } from "@/features/nearby/labels";

export const notificationsQueryKey = ["notifications"] as const;

const seenNotificationIds = new Set<string>();

/** Закрывает системный баннер чата, когда приложение уже открыто, чтобы не дублировать плашку. */
function closeSystemNotifications(tag: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const close = () =>
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) =>
        registration?.getNotifications({ tag }).then((list) => list.forEach((item) => item.close())),
      )
      .catch(() => undefined);
  close();
  window.setTimeout(close, 1500);
  window.setTimeout(close, 4000);
}

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
      notificationsApi.getNotifications({
        limit: 30,
        ...(type ? { type } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
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
      if (seenNotificationIds.has(incoming.id)) return;
      seenNotificationIds.add(incoming.id);
      if (seenNotificationIds.size > 200) {
        const oldest = seenNotificationIds.values().next().value;
        if (oldest) seenNotificationIds.delete(oldest);
      }
      queryClient.setQueriesData<NotificationFeed>(
        {
          predicate: (query) =>
            query.queryKey[0] === notificationsQueryKey[0] && query.queryKey[1] === "recent",
        },
        (previous) => {
          if (!previous || previous.items.some((item) => item.id === incoming.id)) return previous;
          return {
            ...previous,
            unreadCount: previous.unreadCount + 1,
            items: [incoming, ...previous.items],
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });

      if (incoming.kind === "new_message" || incoming.kind === "match") {
        void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] });
        const { title, href, conversationId } = describeNotification(incoming);
        const inThatChat =
          conversationId && window.location.pathname === `/chat/${conversationId}`;
        const visible = document.visibilityState === "visible";
        if (visible && conversationId) closeSystemNotifications(`chat-${conversationId}`);
        if (!inThatChat && visible) {
          const preview =
            typeof incoming.payload?.["preview"] === "string"
              ? (incoming.payload["preview"] as string)
              : undefined;
          toast(title, {
            id: incoming.id,
            actorActivity: incoming.payload["actorActivity"],
            kind: incoming.kind,
            description: preview,
              avatarUrl:
                typeof incoming.payload?.["fromAvatarUrl"] === "string"
                  ? (incoming.payload["fromAvatarUrl"] as string)
                  : null,
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
      } else if (document.visibilityState === "visible") {
        const { title, href, description } = describeNotification(incoming);
        toast(title, {
          id: incoming.id,
          actorActivity: incoming.payload["actorActivity"],
          kind: incoming.kind,
          description,
          action: href ? { label: "Открыть", onClick: () => window.location.assign(href) } : undefined,
        });
      }
    };

    const sendVisibility = () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "visibility", visible: document.visibilityState === "visible" }));
      }
    };
    const heartbeat = window.setInterval(sendVisibility, 8000);

    const connect = () => {
      if (disposed) return;
      const token = getToken();
      if (!token) return;
      try {
        socket = new WebSocket(`${base}/notifications?token=${encodeURIComponent(token)}`);
      } catch (error) {
        console.warn("[ws] уведомления недоступны:", error);
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        if (disposed) socket?.close();
        sendVisibility();
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
    window.addEventListener(RESUME_EVENT, onVisible);
    document.addEventListener("visibilitychange", sendVisibility);
    window.addEventListener("pagehide", sendVisibility);

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", sendVisibility);
      window.removeEventListener("pagehide", sendVisibility);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener(RESUME_EVENT, onVisible);
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

  if (notification.kind === "urgent_reserved") {
    return result("Ваш лот забронирован", listingTitle, listingId ? `/nearby/${listingId}` : null);
  }
  if (notification.kind === "urgent_auto_reserved") {
    return result("Сработала ваша цена: лот забронирован на 30 минут", listingTitle, listingId ? `/nearby/${listingId}` : null);
  }
  if (notification.kind === "urgent_final_call") {
    const price = typeof payload["priceMinor"] === "number" ? payload["priceMinor"] : typeof payload["currentPriceMinor"] === "number" ? payload["currentPriceMinor"] : null;
    return result(price === null ? "Скоро конец срочного лота" : `Скоро конец: цена сейчас ${formatPrice(price)}`, listingTitle, listingId ? `/nearby/${listingId}` : null);
  }
  if (notification.kind === "urgent_expired_relist") {
    return result("Не продано: перезапустить с новым полом?", listingTitle, listingId ? `/nearby/new?category=urgent&relist=${encodeURIComponent(listingId)}` : null);
  }

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
  if (notification.kind === "space_member_joined") {
      return result(`${str("memberName") ?? "Новый участник"} вступил(а) в «${str("spaceTitle") ?? "сообщество"}»`, null, spaceId ? `/spaces/${spaceId}` : null);
    }
    if (notification.kind === "space_join_request") {
      return result(`Заявка в «${str("spaceTitle") ?? "сообщество"}» от ${str("memberName") ?? "участника"}`, null, spaceId ? `/spaces/${spaceId}` : null);
    }
    if (notification.kind === "space_invite") {
      return result(`${str("fromName") ?? "Организатор"} приглашает вас в сообщество «${str("spaceTitle") ?? "сообщество"}»`, null, spaceId ? `/spaces/${spaceId}` : null);
    }
    if (notification.kind === "space_message_deleted") {
    return result(
      "Сообщение удалено администратором сообщества",
      str("spaceTitle") ? `Сообщество «${str("spaceTitle")}»` : null,
      spaceId ? `/spaces/${spaceId}` : null,
    );
  }
  if (notification.kind === "space_event") {
    const href = spaceId
      ? `/spaces/${spaceId}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`
      : null;
    return result(
      `Новая встреча в «${str("spaceTitle") ?? "Сообществе"}»`,
      [str("title"), str("place")].filter(Boolean).join(" · ") || null,
      href,
    );
  }
  return result(listingTitle, null, listingId ? `/nearby/${listingId}` : null);
}
