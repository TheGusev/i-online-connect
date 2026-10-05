import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const HOLD_MS = 350;
const MOVE_TOLERANCE = 8;
const AXIS_LOCK = 6;
const MAX_SHIFT = 56;
const REPLY_AT = 40;
const EDGE = 20;

export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* не поддерживается */ }
}

/** Единые жесты пузыря: удержание — меню, свайп в любую сторону — ответ. */
export function useMessageGestures({ onHold, onReply }: { onHold?: () => void; onReply?: () => void }) {
  const [offset, setOffset] = useState(0);
  const st = useRef<{ x: number; y: number; id: number; axis: "x" | "y" | null; held: boolean; armed: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);

  const end = () => {
    clear();
    const s = st.current;
    st.current = null;
    if (s?.armed && onReply) onReply();
    setOffset(0);
  };

  return {
    offset,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const target = e.target as HTMLElement;
        const blocked = Boolean(target.closest("a,button,video,img,input,[data-no-gesture]"));
        st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, held: false, armed: false };
        if (onHold) {
          timer.current = setTimeout(() => {
            if (!st.current) return;
            st.current.held = true;
            haptic(12);
            onHold();
          }, HOLD_MS);
        }
        if (blocked || e.clientX < EDGE) st.current.axis = "y";
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = st.current;
        if (!s || s.id !== e.pointerId || s.held) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE) clear();
        if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > AXIS_LOCK) {
          s.axis = Math.abs(dx) > Math.abs(dy) && onReply ? "x" : "y";
          if (s.axis === "x") {
            clear();
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* нет */ }
          }
        }
        if (s.axis !== "x") return;
        const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx));
        if (Math.abs(shift) >= REPLY_AT && !s.armed) { s.armed = true; haptic(8); }
        else if (Math.abs(shift) < REPLY_AT) s.armed = false;
        setOffset(shift);
      },
      onPointerUp: end,
      onPointerCancel: () => { if (st.current) st.current.armed = false; end(); },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        if (!st.current && onHold) onHold();
      },
    },
  };
}

/* Быстрые реакции: хранятся на этом устройстве. */
const KEY = "chat-reactions";
const listeners = new Set<() => void>();
let cache: Record<string, string> | null = null;
function read(): Record<string, string> {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { cache = {}; }
  return cache!;
}
export function toggleReaction(messageId: string, emoji: string) {
  const next = { ...read() };
  if (next[messageId] === emoji) delete next[messageId]; else next[messageId] = emoji;
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* полный storage */ }
  listeners.forEach((l) => l());
}
export function useReaction(messageId: string) {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => read()[messageId] ?? null,
    () => null,
  );
}
