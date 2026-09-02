import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";

import {
  describeNotification,
  useMarkNotificationsRead,
  useNotificationSocket,
  useNotifications,
} from "@/features/notifications/hooks";

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
                {items.map((item) => {
                  const { title, listingId } = describeNotification(item);
                  const content = (
                    <span className="block">
                      <span className="block text-sm leading-snug">{title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  );
                  return (
                    <li key={item.id}>
                      {listingId ? (
                        <Link
                          to="/nearby/$id"
                          params={{ id: listingId }}
                          onClick={() => {
                            setOpen(false);
                            markRead.mutate([item.id]);
                          }}
                          className={`block rounded-xl px-3 py-2 transition-colors hover:bg-secondary ${
                            item.readAt ? "" : "bg-primary-soft/60"
                          }`}
                        >
                          {content}
                        </Link>
                      ) : (
                        <span className="block rounded-xl px-3 py-2">{content}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
