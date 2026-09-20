import { CalendarDays, Coffee, MessagesSquare, Lock } from "lucide-react";

import type { OwnerTrustStats } from "@/api";
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
    <div>
      <ul className="divide-y divide-border sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map(({ icon: Icon, label, value }) => (
          <li key={label} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 py-3 first:pt-0 last:pb-0 sm:block sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0">
            <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold text-foreground">{value}</span>
              <span className="block text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Эти данные видны только тебе. Другие видят лишь бейдж доверия.
      </p>
    </div>
  );
}
