import { Clock, ShieldCheck, Video } from "lucide-react";

import type { VerificationStatus } from "@/api";
import { Button, Card } from "@/components/ds";

const statusConfig: Record<
  VerificationStatus,
  { label: string; tone: string; icon: typeof ShieldCheck }
> = {
  none: {
    label: "Не пройдена",
    tone: "border-warning/35 bg-warning-soft text-warning-foreground",
    icon: Video,
  },
  pending: {
    label: "На проверке",
    tone: "border-border bg-secondary text-secondary-foreground",
    icon: Clock,
  },
  verified: {
    label: "Пройдена",
    tone: "border-success/35 bg-success-soft text-foreground",
    icon: ShieldCheck,
  },
};

/** Статус видео-верификации и объяснение, зачем она нужна. */
export function VerificationSection({
  status,
  onStart,
}: {
  status: VerificationStatus;
  onStart: () => void;
}) {
  const { label, tone, icon: Icon } = statusConfig[status];

  return (
    <Card className="p-6">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Видео-верификация — короткая запись на 10 секунд. Мы сверяем её с фото и удаляем запись
        после проверки. Она нужна, чтобы в «Я Онлайн» не было чужих фотографий и фейковых анкет:
        подтверждённые профили чаще получают ответ и попадают в подборки к другим подтверждённым
        людям.
      </p>

      {status !== "verified" ? (
        <Button className="mt-5" onClick={onStart} disabled={status === "pending"}>
          <Video aria-hidden="true" />
          {status === "pending" ? "Проверяем запись" : "Пройти видео-верификацию"}
        </Button>
      ) : (
        <Button className="mt-5" variant="secondary" onClick={onStart}>
          <Video aria-hidden="true" />
          Обновить видео-интро
        </Button>
      )}
    </Card>
  );
}
