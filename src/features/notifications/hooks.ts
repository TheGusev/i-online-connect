import { RESUME_EVENT } from "@/api";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast as systemToast } from "sonner";
import { gtaToast as toast } from "./gtaToast";
import { getToken, notificationsApi } from "@/api";
import type { AppNotification, NotificationFeed } from "@/api";
import { getSessionRevision, isSessionCurrent } from "@/api/client";
import { subscribeSessionChanges } from "@/api/session-scope.mjs";
import { createNotificationChannel, type NotificationChannel } from "@/api/notification-channel.mjs";
import { resolveWsUrl } from "@/features/chat/useChatSocket";
import { useSessionStore } from "@/store/useSessionStore";
import { formatPrice } from "@/features/nearby/labels";

export const notificationsQueryKey = ["notifications"] as const;

/** Closing system banners is also cancelled when the owning session ends. */
function closeSystemNotifications(tag: string, channel: NotificationChannel) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const close = channel.guard(() => {
    void navigator.serviceWorker.getRegistration()
      .then(channel.guard((registration: ServiceWorkerRegistration | undefined) => registration?.getNotifications({ tag })))
      .then(channel.guard((list: Notification[] | undefined) => list?.forEach(item => item.close())))
      .catch(() => undefined);
  });
  close(); channel.after(close, 1500); channel.after(close, 4000);
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
    queryFn: ({ pageParam }) => notificationsApi.getNotifications({
      limit: 30, ...(type ? { type } : {}), ...(pageParam ? { cursor: pageParam } : {}),
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: notificationsQueryKey }); },
  });
}

/** Live notifications, banners and delayed actions belong to one account/session. */
export function useNotificationSocket() {
  const authed = useSessionStore(state => state.status === "authed");
  const accountId = useSessionStore(state => state.user?.id ?? null);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!authed || !accountId || typeof window === "undefined") return;
    const base = resolveWsUrl();
    if (!base) return;
    const shown = new Set<string | number>();
    const channel: NotificationChannel = createNotificationChannel({
      getToken, getRevision: getSessionRevision, isCurrent: isSessionCurrent,
      subscribe: listener => subscribeSessionChanges(getToken, listener),
      createSocket: token => new WebSocket(`${base}/notifications?token=${encodeURIComponent(token)}`),
      host: window, document, resumeEvent: RESUME_EVENT,
      onResume: () => {
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
        if (channel.isActive()) void queryClient.invalidateQueries({ queryKey: ["chat"] });
      },
      onDispose: () => {
        for (const id of shown) systemToast.dismiss(id);
        shown.clear();
      },
      onNotification: incoming => {
        queryClient.setQueriesData<NotificationFeed>({
          predicate: query => query.queryKey[0] === notificationsQueryKey[0] && query.queryKey[1] === "recent",
        }, previous => {
          if (!channel.isActive() || !previous || previous.items.some(item => item.id === incoming.id)) return previous;
          return { ...previous, unreadCount: previous.unreadCount + 1, items: [incoming, ...previous.items] };
        });
        if (!channel.isActive()) return;
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
        const show = (title: string, options: Parameters<typeof toast>[1]) => {
          if (!channel.isActive()) return;
          const id = options?.id;
          if (id !== undefined) { shown.add(id); channel.after(() => { shown.delete(id); }, 6500); }
          toast(title, options);
        };
        const payload = incoming.payload ?? {};
        if (incoming.kind === "new_message" || incoming.kind === "match") {
          if (!channel.isActive()) return;
          void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
          if (!channel.isActive()) return;
          void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] });
          if (!channel.isActive()) return;
          const { title, href, conversationId } = describeNotification(incoming);
          const inThatChat = conversationId && window.location.pathname === `/chat/${conversationId}`;
          const visible = document.visibilityState === "visible";
          if (visible && conversationId) closeSystemNotifications(`chat-${conversationId}`, channel);
          if (!inThatChat && visible) show(title, {
            id: incoming.id, actorActivity: payload["actorActivity"], kind: incoming.kind,
            description: typeof payload["preview"] === "string" ? payload["preview"] : undefined,
            avatarUrl: typeof payload["fromAvatarUrl"] === "string" ? payload["fromAvatarUrl"] : null,
            action: href ? { label: "Открыть", onClick: channel.guard(() => window.location.assign(href)) } : undefined,
          });
        } else if (document.visibilityState === "visible") {
          const { title, href, description } = describeNotification(incoming);
          show(title, { id: incoming.id, actorActivity: payload["actorActivity"], kind: incoming.kind, description,
            action: href ? { label: "Открыть", onClick: channel.guard(() => window.location.assign(href)) } : undefined,
          });
        }
      },
    });
    return channel.dispose;
  }, [authed, accountId, queryClient]);
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
    title, description, href, listingId, conversationId, profileId, spaceId, eventId,
  });
  if (notification.kind === "urgent_reserved") return result("Ваш лот забронирован", listingTitle, listingId ? `/nearby/${listingId}` : null);
  if (notification.kind === "urgent_auto_reserved") return result("Сработала ваша цена: лот забронирован на 30 минут", listingTitle, listingId ? `/nearby/${listingId}` : null);
  if (notification.kind === "urgent_final_call") {
    const price = typeof payload["priceMinor"] === "number" ? payload["priceMinor"] : typeof payload["currentPriceMinor"] === "number" ? payload["currentPriceMinor"] : null;
    return result(price === null ? "Скоро конец срочного лота" : `Скоро конец: цена сейчас ${formatPrice(price)}`, listingTitle, listingId ? `/nearby/${listingId}` : null);
  }
  if (notification.kind === "urgent_expired_relist") return result("Не продано: перезапустить с новым полом?", listingTitle, listingId ? `/nearby/new?category=urgent&relist=${encodeURIComponent(listingId)}` : null);
  if (notification.kind === "listing_response") return result(`Новый отклик на «${listingTitle}»`, null, listingId ? `/nearby/${listingId}` : null);
  if (notification.kind === "listing_match") return result(`Рядом появилось: «${listingTitle}»`, null, listingId ? `/nearby/${listingId}` : null);
  if (notification.kind === "new_message") return result(`Новое сообщение от ${str("fromName") ?? "собеседника"}`, str("preview"), conversationId ? `/chat/${conversationId}` : null);
  if (notification.kind === "match") return result(`Совпадение! Вы понравились друг другу с ${str("withName") ?? "новым человеком"}`, "Откройте профиль и начните разговор.", profileId ? `/profile/${profileId}` : conversationId ? `/chat/${conversationId}` : null);
  if (notification.kind === "space_member_joined") return result(`${str("memberName") ?? "Новый участник"} вступил(а) в «${str("spaceTitle") ?? "сообщество"}»`, null, spaceId ? `/spaces/${spaceId}` : null);
  if (notification.kind === "space_join_request") return result(`Заявка в «${str("spaceTitle") ?? "сообщество"}» от ${str("memberName") ?? "участника"}`, null, spaceId ? `/spaces/${spaceId}` : null);
  if (notification.kind === "space_invite") return result(`${str("fromName") ?? "Организатор"} приглашает вас в сообщество «${str("spaceTitle") ?? "сообщество"}»`, null, spaceId ? `/spaces/${spaceId}` : null);
  if (notification.kind === "space_message_deleted") return result("Сообщение удалено администратором сообщества", str("spaceTitle") ? `Сообщество «${str("spaceTitle")}»` : null, spaceId ? `/spaces/${spaceId}` : null);
  if (notification.kind === "space_event") {
    const href = spaceId ? `/spaces/${spaceId}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}` : null;
    return result(`Новая встреча в «${str("spaceTitle") ?? "Сообществе"}»`, [str("title"), str("place")].filter(Boolean).join(" · ") || null, href);
  }
  return result(listingTitle, null, listingId ? `/nearby/${listingId}` : null);
}
