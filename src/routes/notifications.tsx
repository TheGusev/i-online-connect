import { createFileRoute } from "@tanstack/react-router";
import { BellRing, CheckCheck } from "lucide-react";
import { z } from "zod";

import { Button, Chip } from "@/components/ds";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import {
  type NotificationFilter,
  useMarkNotificationsRead,
  useNotificationHistory,
  useNotificationSocket,
} from "@/features/notifications/hooks";

export const Route = createFileRoute("/notifications")({
  validateSearch: z.object({ type: z.enum(["chats", "meetings", "matches"]).optional() }),
  head: () => ({
    meta: [
      { title: "Центр уведомлений — Я Онлайн" },
      { name: "description", content: "История сообщений, встреч и совпадений в «Я Онлайн»." },
      { property: "og:title", content: "Центр уведомлений — Я Онлайн" },
      { property: "og:description", content: "Все важные события аккаунта в одном месте." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

const filters: { id: NotificationFilter | undefined; label: string }[] = [
  { id: undefined, label: "Все" },
  { id: "chats", label: "Чаты" },
  { id: "meetings", label: "Встречи" },
  { id: "matches", label: "Совпадения" },
];

function NotificationsPage() {
  const { type } = Route.useSearch();
  const navigate = Route.useNavigate();
  const history = useNotificationHistory(type);
  const markRead = useMarkNotificationsRead();
  useNotificationSocket();
  const unread = history.items.filter((item) => !item.readAt).length;

  return (
    <AppShell>
      <PageHeader title="Уведомления" description="Сообщения, встречи и совпадения — без потерянных событий." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((filter) => (
          <Chip
            key={filter.id ?? "all"}
            selected={filter.id === type}
            onClick={() => void navigate({ search: filter.id ? { type: filter.id } : {}, replace: true })}
          >
            {filter.label}
          </Chip>
        ))}
      </div>

      <div className="mb-3 flex min-h-9 items-center justify-end">
        {unread > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => markRead.mutate(undefined)}>
            <CheckCheck aria-hidden="true" />
            Прочитать все
          </Button>
        ) : null}
      </div>

      {history.isPending ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Загружаем историю…</p>
      ) : history.isError ? (
        <p className="py-10 text-center text-sm text-destructive">Не удалось загрузить уведомления.</p>
      ) : history.items.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-border px-6 py-14 text-center">
          <BellRing className="size-8 text-primary" aria-hidden="true" />
          <p className="mt-3 font-semibold">Здесь пока тихо</p>
          <p className="mt-1 text-sm text-muted-foreground">Новые события появятся в этом разделе.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {history.items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border bg-card shadow-soft">
              <NotificationItem
                item={item}
                onPick={() => {
                  if (!item.readAt) markRead.mutate([item.id]);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {history.hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          className="mt-4"
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Показать более ранние
        </Button>
      ) : null}
    </AppShell>
  );
}