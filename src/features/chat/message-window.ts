import type { Message } from "@/api";
import type { MessagesPage } from "@/api/endpoints/chat";

/** Окно истории вокруг сообщения: живёт отдельно от кэша ленты. */
export interface MessageWindow {
  conversationId: string;
  items: Message[];
  hasMore: boolean;
  nextBefore: string | null;
  hasNewer: boolean;
}

/** Свежие версии сообщений (правки, реакции) из живой ленты поверх окна. */
export function overlayMessages(items: Message[], live: Message[] | undefined): Message[] {
  if (!live || live.length === 0) return items;
  const byId = new Map(live.map((message) => [message.id, message]));
  return items.map((message) => byId.get(message.id) ?? message);
}

/** Добавляет более раннюю страницу в начало окна без дублей. */
export function prependOlder(current: MessageWindow, page: MessagesPage): MessageWindow {
  const known = new Set(current.items.map((message) => message.id));
  return {
    ...current,
    items: [...page.items.filter((message) => !known.has(message.id)), ...current.items],
    hasMore: page.hasMore,
    nextBefore: page.nextBefore,
  };
}
