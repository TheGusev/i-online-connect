import { RESUME_EVENT } from "@/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, WS_URL, getToken } from "@/api";
import type { Message } from "@/api";
import { getSessionRevision, isSessionCurrent } from "@/api/client";
import { subscribeSessionChanges } from "@/api/session-scope.mjs";
import { createSocketLease, type SocketLease } from "@/api/socket-lease.mjs";
import { useSessionStore } from "@/store/useSessionStore";

export type ChatSocketStatus = "connecting" | "open" | "closed";
export interface ChatSocketEvent {
  type: "message" | "typing" | "read" | "message-updated" | "message-deleted" | "reaction";
  conversationId: string;
  reactions?: { emoji: string; count: number }[];
  actorEmojis?: string[];
  message?: Message;
  messageId?: string;
  authorId?: string;
  mode?: "text" | "voice";
}
interface UseChatSocketOptions {
  conversationId: string | null;
  onEvent?: (event: ChatSocketEvent) => void;
  url?: string;
}
const TYPING_TTL_MS = 3000;
const TYPING_THROTTLE_MS = 2000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
export function resolveWsUrl(): string {
  if (WS_URL) return WS_URL.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  try {
    const base = API_URL ? new URL(API_URL, window.location.origin) : new URL(window.location.origin);
    const protocol = base.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${base.host}/ws`;
  } catch { return ""; }
}

export function useChatSocket({ conversationId, onEvent, url }: UseChatSocketOptions) {
  const [status, setStatus] = useState<ChatSocketStatus>("connecting");
  const [typing, setTyping] = useState(false);
  const [peerVoice, setPeerVoice] = useState(false);
  const accountId = useSessionStore(state => state.user?.id ?? null);
  const authed = useSessionStore(state => state.status === "authed");
  const handlerRef = useRef(onEvent); handlerRef.current = onEvent;
  const socketRef = useRef<WebSocket | null>(null);
  const leaseRef = useRef<SocketLease | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (!conversationId || !accountId || !authed || typeof window === "undefined") {
      setStatus("closed"); setTyping(false); setPeerVoice(false); return;
    }
    const base = url ?? resolveWsUrl();
    if (!base) { setStatus("closed"); return; }
    let attempt = 0;
    let ownedSocket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    const lease: SocketLease = createSocketLease({
      getRevision: getSessionRevision,
      isCurrent: isSessionCurrent,
      subscribe: listener => subscribeSessionChanges(getToken, listener),
      onDispose: () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", onVisible);
        window.removeEventListener(RESUME_EVENT, onVisible);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (typingTimer) clearTimeout(typingTimer);
        const socket = ownedSocket; ownedSocket = null;
        if (socketRef.current === socket) socketRef.current = null;
        const ownsState = leaseRef.current === lease;
        if (ownsState) leaseRef.current = null;
        try {
          if (socket) {
            socket.onopen = null; socket.onmessage = null;
            socket.onclose = null; socket.onerror = null;
            if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
          }
        } finally {
          if (ownsState) { setStatus("closed"); setTyping(false); setPeerVoice(false); }
        }
      },
    });
    leaseRef.current = lease; lastTypingSentRef.current = 0;
    const bumpTyping = (mode?: "text" | "voice") => {
      setTyping(true); setPeerVoice(mode === "voice");
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(lease.guard(() => { setTyping(false); setPeerVoice(false); }), TYPING_TTL_MS);
    };
    const connect = () => {
      if (!lease.isActive()) return;
      if (ownedSocket && (ownedSocket.readyState === WebSocket.CONNECTING || ownedSocket.readyState === WebSocket.OPEN)) return;
      const token = getToken();
      if (!token || !lease.isActive()) { setStatus("closed"); return; }
      setStatus("connecting");
      let socket: WebSocket;
      try { socket = new WebSocket(`${base}/chat/${conversationId}?token=${encodeURIComponent(token)}`); }
      catch { setStatus("closed"); return; }
      ownedSocket = socket; socketRef.current = socket;
      socket.onopen = lease.guard(() => {
        if (ownedSocket !== socket) return;
        attempt = 0; setStatus("open");
      });
      socket.onmessage = lease.guard((event: MessageEvent) => {
        if (ownedSocket !== socket) return;
        try {
          const payload = JSON.parse(event.data as string) as ChatSocketEvent;
          if (payload.type === "typing") bumpTyping(payload.mode);
          if (payload.type === "message") { setTyping(false); setPeerVoice(false); }
          handlerRef.current?.(payload);
        } catch { /* Ignore malformed frames without exposing payloads. */ }
      });
      socket.onerror = lease.guard(() => { /* onclose performs reconnection. */ });
      socket.onclose = lease.guard((event: CloseEvent) => {
        if (ownedSocket !== socket) return;
        ownedSocket = null;
        if (socketRef.current === socket) socketRef.current = null;
        setStatus("closed");
        if (event.code === 4403) return;
        const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(lease.guard(connect), delay);
      });
    };
    function onVisible() {
      if (document.visibilityState === "visible" && lease.isActive() && !ownedSocket) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        attempt = 0; connect();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener(RESUME_EVENT, onVisible);
    connect();
    return lease.dispose;
  }, [conversationId, url, accountId, authed]);

  const sendTyping = useCallback((mode: "text" | "voice" = "text") => {
    if (!leaseRef.current?.isActive()) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    socket.send(JSON.stringify({ type: "typing", mode }));
  }, []);
  return { status, typing, peerVoice, sendTyping };
}
