import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import {
  useNotificationSocket,
  useNotifications,
} from "@/features/notifications/hooks";

/** Сразу открывает центр уведомлений, сохраняя живой счётчик. */
export function NotificationsBell() {
  const { data } = useNotifications();
  useNotificationSocket();

  const unread = data?.unreadCount ?? 0;

  return (
    <Link
      to="/notifications"
      aria-label={
        unread > 0
          ? `Уведомления, непрочитанных: ${unread}`
          : "Уведомления"
      }
      className="relative grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-200 ease-out hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
