import { HeartHandshake, Lightbulb, MessagesSquare } from "lucide-react";

import type { ProfileIntent } from "@/api";
import { Card } from "@/components/ds";

const intentConfig: Record<ProfileIntent, { label: string; icon: typeof HeartHandshake }> = {
  serious: { label: "Серьёзные отношения", icon: HeartHandshake },
  friends: { label: "Тёплое общение", icon: MessagesSquare },
  projects: { label: "Совместные проекты", icon: Lightbulb },
};

export const intentOptions = (Object.keys(intentConfig) as ProfileIntent[]).map((value) => ({
  value,
  label: intentConfig[value].label,
}));

/** Визуально выделенная карточка намерения. */
export function IntentCard({ intent, note }: { intent: ProfileIntent; note: string }) {
  const { label, icon: Icon } = intentConfig[intent];

  return (
    <Card variant="intent" className="flex items-start gap-4 p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card text-primary shadow-soft">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-lg font-bold leading-snug text-foreground">{label}</p>
        {note ? <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">{note}</p> : null}
      </div>
    </Card>
  );
}
