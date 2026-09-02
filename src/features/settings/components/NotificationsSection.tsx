import type { NotificationChannel, NotificationSettings } from "@/api";
import { Card } from "@/components/ds";
import { ToggleRow } from "@/components/ds";
import { useUpdateNotifications } from "@/features/settings/hooks";

const channels: { id: NotificationChannel; title: string; description: string }[] = [
  {
    id: "matches",
    title: "Новые совпадения",
    description: "Раз в день, когда подборка обновилась.",
  },
  {
    id: "messages",
    title: "Сообщения",
    description: "Новые сообщения в диалогах и групповых чатах Spaces.",
  },
  {
    id: "spaces",
    title: "Приглашения в Spaces",
    description: "Когда тебя приглашают в сообщество или на событие.",
  },
  {
    id: "listings",
    title: "Объявления рядом",
    description: "Когда в твоём городе появляется задача из отмеченных категорий.",
  },
  {
    id: "safety",
    title: "Обновления безопасности",
    description: "Результат верификации, ответ по жалобе, важные предупреждения.",
  },
];

/** Уведомления: по одному переключателю на тип события. */
export function NotificationsSection({ notifications }: { notifications: NotificationSettings }) {
  const update = useUpdateNotifications();

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-border px-6 py-2">
        {channels.map((channel) => (
          <ToggleRow
            key={channel.id}
            title={channel.title}
            description={channel.description}
            checked={notifications[channel.id]}
            onChange={(next) => update.mutate({ [channel.id]: next })}
          />
        ))}
      </Card>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Обновления безопасности можно отключить, но мы советуем оставить их включёнными — там
        приходят результаты проверок и ответы модерации.
      </p>
    </div>
  );
}
