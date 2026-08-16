import { AlertTriangle, PauseCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { DeleteReason } from "@/api";
import { Button, Card, Modal, Select, TextArea } from "@/components/ds";
import { useDeleteAccount } from "@/features/settings/hooks";

const reasons: { value: DeleteReason | ""; label: string }[] = [
  { value: "", label: "Не хочу отвечать" },
  { value: "found-someone", label: "Познакомился(ась) — больше не нужно" },
  { value: "too-few-matches", label: "Мало подходящих совпадений" },
  { value: "privacy", label: "Беспокоюсь за приватность" },
  { value: "break", label: "Нужен перерыв" },
  { value: "other", label: "Другое" },
];

/** Удаление аккаунта: сначала объяснение и опрос, потом подтверждение. */
export function DangerZoneSection({ onPause }: { onPause: () => void }) {
  const [stage, setStage] = useState<"closed" | "survey" | "confirm" | "done">("closed");
  const [reason, setReason] = useState<DeleteReason | "">("");
  const [comment, setComment] = useState("");
  const [restoreDays, setRestoreDays] = useState(30);
  const deleteAccount = useDeleteAccount();

  const submit = () => {
    deleteAccount.mutate(
      {
        ...(reason ? { reason } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      },
      {
        onSuccess: (receipt) => {
          setRestoreDays(receipt.restoreDays);
          setStage("done");
          toast.success("Аккаунт отправлен на удаление", {
            description: `Восстановить его можно в течение ${receipt.restoreDays} дней.`,
          });
        },
        onError: () =>
          toast.error("Не получилось удалить аккаунт", {
            description: "Попробуй позже или напиши в поддержку.",
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <PauseCircle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">Может быть, достаточно паузы?</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Пауза скрывает профиль из подборок, но сохраняет всё остальное. Удаление — необратимо
              после срока восстановления.
            </p>
            <Button variant="secondary" className="mt-4" onClick={onPause}>
              Перейти к паузе
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-destructive/40 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Удалить аккаунт</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Удалим профиль, фото, видео-интро, переписки и участие в Spaces. Мы спросим причину —
              ответить можно, но не обязательно.
            </p>
            <Button
              variant="secondary"
              className="mt-4 border-destructive/40 text-destructive"
              onClick={() => setStage("survey")}
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              Удалить аккаунт
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={stage === "survey"}
        onClose={() => setStage("closed")}
        title="Почему уходишь?"
        description="Ответ помогает нам делать сервис лучше. Этот шаг можно пропустить."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStage("closed")}>
              Остаться
            </Button>
            <Button variant="secondary" onClick={() => setStage("confirm")}>
              Продолжить
            </Button>
          </>
        }
      >
        <Select
          label="Причина (необязательно)"
          value={reason}
          options={reasons}
          onChange={(event) => setReason(event.target.value as DeleteReason | "")}
        />
        <TextArea
          label="Что можно было сделать лучше?"
          value={comment}
          rows={3}
          onChange={(event) => setComment(event.target.value)}
        />
      </Modal>

      <Modal
        open={stage === "confirm"}
        onClose={() => setStage("closed")}
        title="Точно удалить аккаунт?"
        description="Профиль сразу исчезнет из приложения. В течение 30 дней его ещё можно восстановить, потом данные удаляются навсегда."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStage("survey")}>
              Назад
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={submit}
              disabled={deleteAccount.isPending}
            >
              {deleteAccount.isPending ? "Удаляем…" : "Да, удалить"}
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>· Совпадения и сохранённые профили будут потеряны.</li>
          <li>· Переписки удалятся у тебя и станут недоступны собеседникам.</li>
          <li>· Уровень доверия и пройденную верификацию придётся получать заново.</li>
        </ul>
      </Modal>

      <Modal
        open={stage === "done"}
        onClose={() => setStage("closed")}
        title="Аккаунт удалён"
        description={`Мы сохранили возможность восстановления на ${restoreDays} дней — просто войди снова с тем же email.`}
        footer={
          <Button onClick={() => setStage("closed")}>Понятно</Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Спасибо, что был(а) с нами. Если захочешь вернуться — будем рады.
        </p>
      </Modal>
    </div>
  );
}
