import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** Пороги в пикселях. Прогресс панелей идёт за пальцем: чем дальше вверх, тем сильнее сжатие. */
export const READING = {
  reveal: 24,
  headerStart: 12,
  headerSpan: 70,
  bottomStart: 90,
  bottomSpan: 110,
  settleMs: 140,
  arrowOn: 300,
  arrowOff: 160,
} as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function panelProgress(upTravel: number) {
  return {
    top: clamp01((upTravel - READING.headerStart) / READING.headerSpan),
    bottom: clamp01((upTravel - READING.bottomStart) / READING.bottomSpan),
  };
}

export function nextArrow(visible: boolean, distance: number): boolean {
  return visible ? distance > READING.arrowOff : distance >= READING.arrowOn;
}

/** Состояние панели пишем прямо в DOM: без перерисовок React на каждый кадр прокрутки. */
function paint(el: HTMLElement | null, progress: number, edge: "top" | "bottom", animate: boolean) {
  if (!el) return;
  el.style.transition = animate
    ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out"
    : "none";
  if (progress <= 0.001) {
    el.style.transform = "";
    el.style.opacity = "";
  } else {
    const shift = (edge === "top" ? -1 : 1) * progress * 24;
    el.style.transform = `translateY(${shift}%) scale(${1 - progress * 0.4}, ${1 - progress * 0.25})`;
    el.style.opacity = String(1 - progress);
  }
  const off = progress > 0.6;
  el.style.pointerEvents = off ? "none" : "";
  el.toggleAttribute("inert", off);
}

export function useReadingMode({
  scrollerRef,
  ready,
  resetKey,
  keepPanels,
  lastId,
  lastMine,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  ready: boolean;
  resetKey: string;
  keepPanels: boolean;
  lastId: string | undefined;
  lastMine: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [arrow, setArrow] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const distanceRef = useRef(0);
  const lastTopRef = useRef(0);
  const upRef = useRef(0);
  const animRef = useRef(0);
  const animatingRef = useRef(false);
  const settleRef = useRef(0);
  const keepRef = useRef(keepPanels);
  const seenLastRef = useRef<string | null>(null);
  keepRef.current = keepPanels;

  const render = useCallback((animate: boolean) => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { top, bottom } = panelProgress(upRef.current);
    paint(topRef.current, top, "top", animate && !reduce);
    paint(bottomRef.current, bottom, "bottom", animate && !reduce);
    const root = rootRef.current;
    if (root) {
      const height = bottomRef.current?.offsetHeight ?? 0;
      root.style.setProperty("--bot-vis", `${height * (1 - bottom)}px`);
    }
  }, []);

  useEffect(() => {
    upRef.current = 0;
    seenLastRef.current = null;
    setArrow(false);
    setUnseen(0);
    render(false);
  }, [resetKey, render]);

  useEffect(() => {
    if (!keepPanels) return;
    upRef.current = 0;
    render(true);
  }, [keepPanels, render]);

  useEffect(
    () => () => {
      cancelAnimationFrame(animRef.current);
      window.clearTimeout(settleRef.current);
    },
    [],
  );

  /** Высоты панелей → CSS-переменные: лента получает отступы и никогда не прячется под стеклом. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const scroller = scrollerRef.current;
      const pinned = Boolean(scroller) && distanceRef.current <= 120;
      root.style.setProperty("--top-h", `${topRef.current?.offsetHeight ?? 0}px`);
      root.style.setProperty("--bot-h", `${bottomRef.current?.offsetHeight ?? 0}px`);
      render(false);
      if (scroller && pinned && ready) scroller.scrollTop = scroller.scrollHeight;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (topRef.current) observer.observe(topRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [scrollerRef, ready, render]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !ready) return;
    lastTopRef.current = el.scrollTop;
    const settle = () => {
      const { top, bottom } = panelProgress(upRef.current);
      if (bottom > 0 && bottom < 1) {
        upRef.current = bottom >= 0.4 ? READING.bottomStart + READING.bottomSpan : READING.bottomStart;
      } else if (top > 0 && top < 1) {
        upRef.current = top >= 0.4 ? READING.headerStart + READING.headerSpan : 0;
      } else {
        return;
      }
      render(true);
    };
    const onScroll = () => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const pos = Math.min(Math.max(el.scrollTop, 0), max);
      const distance = Math.max(0, max - pos);
      const delta = pos - lastTopRef.current;
      lastTopRef.current = pos;
      distanceRef.current = distance;
      if (animatingRef.current) return;
      setArrow((visible) => nextArrow(visible, distance));
      if (distance <= READING.reveal) {
        setUnseen(0);
        window.clearTimeout(settleRef.current);
        if (upRef.current !== 0) {
          upRef.current = 0;
          render(true);
        }
        return;
      }
      if (keepRef.current) return;
      if (delta < 0) upRef.current += -delta;
      render(false);
      window.clearTimeout(settleRef.current);
      settleRef.current = window.setTimeout(settle, READING.settleMs);
    };
    const stopAnimation = () => {
      if (!animatingRef.current) return;
      cancelAnimationFrame(animRef.current);
      animatingRef.current = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", stopAnimation, { passive: true });
    el.addEventListener("wheel", stopAnimation, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", stopAnimation);
      el.removeEventListener("wheel", stopAnimation);
    };
  }, [scrollerRef, ready, render]);

  useEffect(() => {
    if (!ready || !lastId) return;
    if (seenLastRef.current === null) {
      seenLastRef.current = lastId;
      return;
    }
    if (seenLastRef.current === lastId) return;
    seenLastRef.current = lastId;
    if (!lastMine && distanceRef.current > READING.arrowOff) setUnseen((count) => count + 1);
  }, [ready, lastId, lastMine]);

  /** Плавно к последнему сообщению; цель пересчитывается каждый кадр, панели возвращаются параллельно. */
  const scrollToLatest = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    cancelAnimationFrame(animRef.current);
    window.clearTimeout(settleRef.current);
    upRef.current = 0;
    render(true);
    setUnseen(0);
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTop = el.scrollTop;
    const startedAt = performance.now();
    const duration = reduce ? 0 : Math.min(520, 220 + distanceRef.current / 8);
    animatingRef.current = true;
    setArrow(false);
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const target = el.scrollHeight - el.clientHeight;
      el.scrollTop = startTop + (target - startTop) * eased;
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
        return;
      }
      el.scrollTop = el.scrollHeight;
      animatingRef.current = false;
      distanceRef.current = 0;
    };
    animRef.current = requestAnimationFrame(step);
  }, [scrollerRef, render]);

  return { rootRef, topRef, bottomRef, arrowVisible: arrow, unseen, scrollToLatest };
}
