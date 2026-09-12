import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";

import { useMarkNotificationsRead, useNotificationSocket, useNotifications } from "@/features/notifications/hooks";
import { NotificationItem } from "./NotificationItem";

/** Колокольчик с живым счётчиком: клик по уведомлению ведёт на объявление. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  useNotificationSocket();

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Уведомления"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Закрыть уведомления"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-border bg-card p-3 shadow-lift">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">Уведомления</span>
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => markRead.mutate(undefined)}
                >
                  Прочитано
                </button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="px-1 py-4 text-sm text-muted-foreground">Пока тихо — новостей нет.</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id}>
                    <NotificationItem
                      item={item}
                      compact
                      onPick={() => {
                        setOpen(false);
                        if (!item.readAt) markRead.mutate([item.id]);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="mt-2 block border-t border-border px-2 pt-3 text-center text-sm font-semibold text-primary"
            >
              Все уведомления
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
