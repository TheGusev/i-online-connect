import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { isKeyboardOpenNow } from "@/hooks/useViewportHeight";

import {
  EDGE_BACK_ZONE,
  TAB_PATHS,
  classifySwipe,
  isBlockedTarget,
  resist,
  shouldCommit,
  tabIndexOf,
} from "./swipe-rules";

/** Направление, с которого должна въехать следующая вкладка (живёт между экранами). */
let pendingEnter: "left" | "right" | null = null;
const SCROLL_KEY = "tab-scroll:";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type PeekState = { side: "left" | "right"; index: number } | null;

/**
 * Жест экрана. На вкладках — листание Чат/Рядом/Сообщества/Профиль за пальцем;
 * на вложенных экранах — только «назад» от левого края, как на iOS.
 */
export function useScreenSwipe(enabled: boolean) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const [peek, setPeek] = useState<PeekState>(null);
  const [enterClass, setEnterClass] = useState<string>("");
  const [optimisticTab, setOptimisticTab] = useState<number | null>(null);

  const tabIndex = location.search && "edit" in (location.search as object) ? -1 : tabIndexOf(location.pathname);

  // Въезд новой вкладки и восстановление прокрутки после свайпа.
  useLayoutEffect(() => {
    if (!enabled) return;
    const dir = pendingEnter;
    pendingEnter = null;
    if (!dir) return;
    const saved = sessionStorage.getItem(SCROLL_KEY + location.pathname);
    if (saved) window.scrollTo(0, Number(saved));
    if (!reducedMotion()) setEnterClass(dir === "right" ? "swipe-enter-right" : "swipe-enter-left");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!enabled || !el) return;
    const isTab = tabIndex >= 0;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let mode: "idle" | "pending" | "active" | "off" = "idle";

    const setX = (x: number, animate: boolean) => {
      el.style.transition = animate ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      el.style.transform = x === 0 ? "" : `translateX(${x}px)`;
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) return;
      mode = "off";
      if (isKeyboardOpenNow()) return;
      if (isBlockedTarget(event.target as Element | null)) return;
      if (document.querySelector("[role='dialog'], [aria-modal='true']")) return;
      if (!isTab && touch.clientX > EDGE_BACK_ZONE) return;
      startX = lastX = touch.clientX;
      startY = touch.clientY;
      lastT = event.timeStamp;
      velocity = 0;
      mode = "pending";
    };

    const onMove = (event: TouchEvent) => {
      if (mode !== "pending" && mode !== "active") return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (mode === "pending") {
        const kind = classifySwipe(dx, dy);
        if (kind === "pending") return;
        if (kind === "vertical" || (!isTab && dx < 0)) {
          mode = "off";
          return;
        }
        mode = "active";
      }
      const dt = Math.max(1, event.timeStamp - lastT);
      velocity = (touch.clientX - lastX) / dt;
      lastX = touch.clientX;
      lastT = event.timeStamp;
      if (event.cancelable) event.preventDefault();

      if (isTab) {
        const neighbor = tabIndex + (dx < 0 ? 1 : -1);
        const has = neighbor >= 0 && neighbor < TAB_PATHS.length;
        setPeek(has ? { side: dx < 0 ? "right" : "left", index: neighbor } : null);
        setX(resist(dx, has), false);
      } else {
        setX(Math.max(0, dx), false);
      }
    };

    const onEnd = () => {
      if (mode !== "active") {
        mode = "idle";
        return;
      }
      mode = "idle";
      const dx = lastX - startX;
      const width = window.innerWidth;
      const target = isTab ? tabIndex + (dx < 0 ? 1 : -1) : -1;
      const canGo = isTab ? target >= 0 && target < TAB_PATHS.length : dx > 0;
      if (!canGo || !shouldCommit(dx, width, velocity)) {
        setX(0, !reducedMotion());
        window.setTimeout(() => setPeek(null), 260);
        return;
      }
      const finish = () => {
        if (isTab) {
          sessionStorage.setItem(SCROLL_KEY + location.pathname, String(window.scrollY));
          pendingEnter = dx < 0 ? "right" : "left";
          void navigate({ to: TAB_PATHS[target]! });
        } else {
          router.history.back();
        }
      };
      if (isTab) setOptimisticTab(target);
      if (reducedMotion()) {
        finish();
        return;
      }
      setX(dx < 0 ? -width : width, true);
      window.setTimeout(finish, 240);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, tabIndex, location.pathname, navigate, router]);

  return { surfaceRef, peek, enterClass, optimisticTab };
}
