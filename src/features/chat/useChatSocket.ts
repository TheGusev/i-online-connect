import { useEffect, useRef, useState } from "react";

import { WS_URL } from "@/api";
import type { Message } from "@/api";

export type ChatSocketStatus = "connecting" | "open" | "closed";

export interface ChatSocketEvent {
  type: "message" | "typing" | "read";
  conversationId: string;
  message?: Message;
  authorId?: string;
}

interface UseChatSocketOptions {
  conversationId: string | null;
  onEvent?: (event: ChatSocketEvent) => void;
  /** Полный URL реального сервера. Если не задан — работает мок-реализация. */
  url?: string;
}

/**
 * Транспорт реального времени для чата.
 *
 * Сейчас работает как мок: соединение «открывается» и присылает изредка событие
 * набора текста. Когда появится реальный сервер, достаточно передать `url` —
 * ветка с настоящим WebSocket уже подготовлена и повторяет тот же контракт.
 */
export function useChatSocket({ conversationId, onEvent, url = WS_URL }: UseChatSocketOptions) {
  const [status, setStatus] = useState<ChatSocketStatus>("connecting");
  const [typing, setTyping] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!conversationId) {
      setStatus("closed");
      return;
    }

    setStatus("connecting");
    setTyping(false);

    // Реальный сервер: тот же контракт событий, что и у мока.
    if (url) {
      const socket = new WebSocket(`${url}/chat/${conversationId}`);
      socket.onopen = () => setStatus("open");
      socket.onclose = () => setStatus("closed");
      socket.onerror = () => setStatus("closed");
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as ChatSocketEvent;
          if (payload.type === "typing") setTyping(true);
          handlerRef.current?.(payload);
        } catch {
          // Неразобранные кадры игнорируем: интерфейс не должен ломаться.
        }
      };
      return () => socket.close();
    }

    // Мок-реализация.
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStatus("open"), 400));
    const typingTimer = setInterval(() => {
      setTyping(true);
      handlerRef.current?.({ type: "typing", conversationId });
      timers.push(setTimeout(() => setTyping(false), 2200));
    }, 16000);

    return () => {
      clearInterval(typingTimer);
      timers.forEach(clearTimeout);
      setStatus("closed");
    };
  }, [conversationId, url]);

  return { status, typing };
}
