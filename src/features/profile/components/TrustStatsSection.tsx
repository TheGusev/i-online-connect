import { CalendarDays, Coffee, MessagesSquare, Lock } from "lucide-react";

import type { OwnerTrustStats } from "@/api";
import { Card } from "@/components/ds";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Личная статистика доверия. Без публичного рейтинга и баллов. */
export function TrustStatsSection({ stats }: { stats: OwnerTrustStats }) {
  const items = [
    {
      icon: MessagesSquare,
      label: "Диалогов без жалоб",
      value: String(stats.cleanConversations),
    },
    { icon: Coffee, label: "Безопасных встреч", value: String(stats.safeMeetings) },
    { icon: CalendarDays, label: "На платформе с", value: formatDate(stats.joinedAt) },
  ];

  return (
    <Card className="p-6">
      <ul className="grid gap-5 sm:grid-cols-3">
        {items.map(({ icon: Icon, label, value }) => (
          <li key={label}>
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <p className="mt-3 text-xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Эти цифры видишь только ты. У профиля нет публичного рейтинга и баллов — другие видят лишь
        бейдж доверия и его расшифровку.
      </p>
    </Card>
  );
}
