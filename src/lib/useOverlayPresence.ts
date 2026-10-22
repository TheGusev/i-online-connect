import { useEffect, useState } from "react";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Присутствие окна в DOM: пока идёт анимация выхода (leaveMs), окно остаётся
 * смонтированным с флагом leaving. Родитель получает onClose сразу, а окно
 * мягко уходит само. При prefers-reduced-motion размонтирует мгновенно.
 */
export function useOverlayPresence(
  open: boolean,
  leaveMs: number,
): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, leaveMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { mounted, leaving };
}
