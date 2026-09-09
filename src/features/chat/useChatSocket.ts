import { useCallback, useEffect, useRef, useState } from "react";

import { API_URL, WS_URL, getToken } from "@/api";
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
  /** Полный базовый URL сокета (…/ws). По умолчанию — VITE_WS_URL или адрес сайта. */
  url?: string;
}

const TYPING_TTL_MS = 3000;
const TYPING_THROTTLE_MS = 2000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/**
 * Базовый адрес WebSocket. Если VITE_WS_URL не задан, выводим его из
 * VITE_API_URL (тот же хост, путь /ws) либо из адреса текущей страницы.
 */
export function resolveWsUrl(): string {
  if (WS_URL) return WS_URL.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  try {
    const base = API_URL ? new URL(API_URL, window.location.origin) : new URL(window.location.origin);
    const protocol = base.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${base.host}/ws`;
  } catch {
    return "";
  }
}

/**
 * Реальный транспорт чата: подключение к /ws/chat/:id, автопереподключение с
 * нарастающей задержкой, «печатает…» с автосбросом и отправка typing.
 */
export function useChatSocket({ conversationId, onEvent, url }: UseChatSocketOptions) {
  const [status, setStatus] = useState<ChatSocketStatus>("connecting");
  const [typing, setTyping] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const socketRef = useRef<WebSocket | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (!conversationId || typeof window === "undefined") {
      setStatus("closed");
      return;
    }
    const base = url ?? resolveWsUrl();
    if (!base) {
      setStatus("closed");
      return;
    }

    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;

    const bumpTyping = () => {
      setTyping(true);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setTyping(false), TYPING_TTL_MS);
    };

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const token = getToken();
      const socket = new WebSocket(
        `${base}/chat/${conversationId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as ChatSocketEvent;
          if (payload.type === "typing") bumpTyping();
          if (payload.type === "message") setTyping(false);
          handlerRef.current?.(payload);
        } catch {
          // Неразобранные кадры игнорируем: интерфейс не должен ломаться.
        }
      };
      socket.onerror = () => {
        /* onclose вызовется следом и запланирует переподключение */
      };
      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        setStatus("closed");
        if (disposed) return;
        // 4401/4403 — нас не пустили: без нового токена стучаться бесполезно.
        if (event.code === 4403) return;
        const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !socketRef.current && !disposed) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        attempt = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typingTimer) clearTimeout(typingTimer);
      socketRef.current?.close();
      socketRef.current = null;
      setTyping(false);
    };
  }, [conversationId, url]);

  /** Сообщить собеседнику, что мы печатаем (не чаще раза в 2 секунды). */
  const sendTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    socket.send(JSON.stringify({ type: "typing" }));
  }, []);

  return { status, typing, sendTyping };
}
