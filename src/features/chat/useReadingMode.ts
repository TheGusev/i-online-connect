import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** Уровень панелей: 0 — обе на месте, 1 — шапка убрана, 2 — убраны обе. */
export type PanelLevel = 0 | 1 | 2;

/** Пороги в пикселях; расстояние считается от низа ленты. */
export const READING = {
  reveal: 24,
  headerFrom: 160,
  allFrom: 320,
  headerUp: 36,
  allUp: 48,
  arrowOn: 300,
  arrowOff: 160,
} as const;

export function nextPanelLevel(level: PanelLevel, distance: number, upTravel: number): PanelLevel {
  if (distance <= READING.reveal) return 0;
  if (distance >= READING.allFrom && upTravel >= READING.allUp) return 2;
  if (level < 1 && distance >= READING.headerFrom && upTravel >= READING.headerUp) return 1;
  return level;
}

export function nextArrow(visible: boolean, distance: number): boolean {
  return visible ? distance > READING.arrowOff : distance >= READING.arrowOn;
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
  const [level, setLevel] = useState<PanelLevel>(0);
  const [arrow, setArrow] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const distanceRef = useRef(0);
  const lastTopRef = useRef(0);
  const upRef = useRef(0);
  const animRef = useRef(0);
  const animatingRef = useRef(false);
  const seenLastRef = useRef<string | null>(null);

  useEffect(() => {
    setLevel(0);
    setArrow(false);
    setUnseen(0);
    upRef.current = 0;
    seenLastRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (!keepPanels) return;
    setLevel(0);
    upRef.current = 0;
  }, [keepPanels]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !ready) return;
    lastTopRef.current = el.scrollTop;
    const onScroll = () => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const top = Math.min(Math.max(el.scrollTop, 0), max);
      const distance = Math.max(0, max - top);
      const delta = top - lastTopRef.current;
      lastTopRef.current = top;
      distanceRef.current = distance;
      if (distance <= READING.reveal) setUnseen(0);
      setArrow((visible) => nextArrow(visible, distance));
      if (animatingRef.current) return;
      if (delta < 0) upRef.current += -delta;
      else if (delta > 2) upRef.current = 0;
      setLevel((current) => nextPanelLevel(current, distance, upRef.current));
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
  }, [scrollerRef, ready]);

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

  /** Плавно к последнему сообщению: цель пересчитывается каждый кадр, потому что панели возвращаются и лента сжимается. */
  const scrollToLatest = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    cancelAnimationFrame(animRef.current);
    setLevel(0);
    setUnseen(0);
    upRef.current = 0;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTop = el.scrollTop;
    const startedAt = performance.now();
    const duration = reduce ? 0 : Math.min(520, 220 + distanceRef.current / 8);
    animatingRef.current = true;
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
      setArrow(false);
    };
    animRef.current = requestAnimationFrame(step);
  }, [scrollerRef]);

  const effective: PanelLevel = keepPanels ? 0 : level;
  return {
    headerHidden: effective >= 1,
    bottomHidden: effective >= 2,
    arrowVisible: arrow,
    unseen,
    scrollToLatest,
  };
}
