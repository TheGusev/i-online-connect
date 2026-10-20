import { X } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="viewport-overlay z-50 flex items-center justify-center p-4">
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/35 backdrop-blur-sm animate-in fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 max-h-[88%] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-lift animate-in fade-in zoom-in-95",
          className,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {title && <h2 className="pr-8 text-xl font-bold text-foreground">{title}</h2>}
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children && <div className="mt-4 space-y-4 text-sm">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface BottomSheetProps extends ModalProps {}

const SHEET_LEAVE_MS = 260;
const SHEET_CLOSE_PX = 100;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Нижнее окно с той же механикой, что у окна объявления: плавное появление,
 * закрытие с анимацией выхода (окно живёт в DOM ещё 260 мс после open=false),
 * свайп вниз за шапку. Родитель всегда получает onClose сразу.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ y: number; current: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      setOffset(0);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      setOffset(0);
      return;
    }
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      setOffset(0);
    }, SHEET_LEAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving) return;
    drag.current = { y: event.clientY, current: 0 };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = Math.max(0, event.clientY - drag.current.y);
    drag.current.current = next;
    setOffset(next);
  };
  const pointerEnd = () => {
    const shouldClose = (drag.current?.current ?? 0) > SHEET_CLOSE_PX;
    drag.current = null;
    setDragging(false);
    if (shouldClose) {
      onClose();
      return;
    }
    setOffset(0);
  };

  return createPortal(
    <div data-no-swipe className="viewport-overlay z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={() => {
          if (!leaving) onClose();
        }}
        className={cn(
          "absolute inset-0 bg-foreground/35 backdrop-blur-sm",
          leaving ? "backdrop-leave" : "backdrop-enter",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex max-h-[88%] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl border border-border bg-card shadow-lift",
          leaving ? "sheet-leave" : "sheet-enter",
          !leaving && !dragging && "transition-transform duration-200",
          className,
        )}
        style={
          leaving
            ? ({ "--sheet-from": `${offset}px` } as CSSProperties)
            : { transform: offset ? `translateY(${offset}px)` : undefined }
        }
      >
        <div
          className="touch-none px-5 pb-2 pt-3"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" />
          {title && <h2 className="text-lg font-bold text-foreground">{title}</h2>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {children && <div className="mt-2 space-y-4 text-sm">{children}</div>}
          {footer && <div className="mt-6 flex flex-col gap-2">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
