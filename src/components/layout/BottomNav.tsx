import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUnreadChatCount } from "@/features/chat/hooks";
import { reorderByOffset, TAB_ORDER_HINT_KEY } from "@/features/navigation/tab-order";
import { useTabOrder } from "@/features/navigation/useTabOrder";
import { useKeyboardOpen } from "@/hooks/useViewportHeight";
import { useSessionStore } from "@/store/useSessionStore";

import { navItems } from "./nav-items";
import { NavBadge } from "./NavBadge";

const LONG_PRESS_MS = 400;
const HINT_MS = 4000;

export function BottomNav({ activeOverride }: { activeOverride?: string | undefined } = {}) {
  const { t } = useTranslation();
  // Гостю приватная навигация не нужна: за ней всё равно стоит вход.
  const authed = useSessionStore((state) => state.status === "authed");
  const { data: unreadChats = 0 } = useUnreadChatCount(authed);
  // При открытой клавиатуре панель прячем: иначе она всплывает над клавиатурой
  // и перекрывает поле ввода.
  const keyboardOpen = useKeyboardOpen();
  const [order, setOrder] = useTabOrder();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const press = useRef<{ pointerId: number; startX: number; index: number; timer: number } | null>(null);

  // Одноразовая подсказка про перестановку: после первого входа, гаснет сама.
  useEffect(() => {
    if (!authed) return;
    try {
      if (window.localStorage.getItem(TAB_ORDER_HINT_KEY)) return;
      window.localStorage.setItem(TAB_ORDER_HINT_KEY, "1");
    } catch {
      return;
    }
    setShowHint(true);
    const timer = window.setTimeout(() => setShowHint(false), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [authed]);

  if (!authed || keyboardOpen) return null;

  const orderedItems = order
    .map((path) => navItems.find((item) => item.to === path))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const onPointerDown = (event: React.PointerEvent, index: number) => {
    if (dragIndex !== null) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const timer = window.setTimeout(() => {
      setDragIndex(index);
      // Удержание включило перестановку: блокируем прокрутку и свайп экранов.
      (event.target as HTMLElement).releasePointerCapture?.(pointerId);
    }, LONG_PRESS_MS);
    press.current = { pointerId, startX, index, timer };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = press.current;
    if (!active || event.pointerId !== active.pointerId) return;
    if (dragIndex === null) {
      // Палец ушёл до срабатывания удержания — это прокрутка/свайп, не перестановка.
      if (Math.abs(event.clientX - active.startX) > 12) cancelPress();
      return;
    }
    event.preventDefault();
    const width = listRef.current?.clientWidth ?? 1;
    const slot = width / Math.max(1, orderedItems.length);
    const slots = Math.round((event.clientX - active.startX) / slot);
    const next = reorderByOffset(order, active.index, slots);
    if (next !== order) {
      active.index = order.indexOf(next[active.index]!) === active.index ? active.index : next.indexOf(order[active.index]!);
      active.index = next.indexOf(orderedItems[active.index]?.to as never) as number;
      active.index = next.indexOf(order[active.index]!);
      active.startX = event.clientX;
      setOrder(next);
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (press.current && event.pointerId === press.current.pointerId) cancelPress();
    if (dragIndex !== null) {
      event.preventDefault();
      setDragIndex(null);
    }
  };

  return (
    <nav
      data-no-swipe
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      style={dragIndex !== null ? { touchAction: "none" } : undefined}
    >
      {showHint ? (
        <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-glow">
          Удерживайте вкладку, чтобы поменять порядок
        </div>
      ) : null}
      <ul
        ref={listRef}
        className={orderedItems.length === 5 ? "grid grid-cols-5" : "grid grid-cols-4"}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {orderedItems.map(({ to, params, labelKey, icon: Icon }, index) => (
          <li
            key={to}
            className={`min-w-0 ${dragIndex !== null ? (dragIndex === index ? "nav-drag-active" : "nav-drag-wiggle") : ""}`}
            onPointerDown={(event) => onPointerDown(event, index)}
          >
            <Link
              to={to}
              {...(params ? { params } : {})}
              onClickCapture={dragIndex !== null ? (event) => event.preventDefault() : undefined}
              activeProps={{
                className:
                  "text-primary font-semibold before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
              }}
              className={`relative flex h-14 ${activeOverride ? (activeOverride === to ? "!text-primary font-semibold before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary" : "!text-muted-foreground !font-normal before:hidden") : ""} min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] leading-none text-muted-foreground transition-colors`}
            >
              <span className="relative">
                <Icon className="size-6" aria-hidden="true" />
                {to === "/chat" ? <NavBadge count={unreadChats} /> : null}
              </span>
              <span className="w-full truncate text-center">{t(labelKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
