import { useState } from "react";
import { Clock, DoorOpen, ShieldQuestion } from "lucide-react";

import type { SpaceDetail } from "@/api";
import { BottomSheet, Button, TextArea } from "@/components/ds";

/**
 * Мягкая модерация входа: открытые сообщества по интересам пускают сразу,
 * приватные — после короткого ответа организатору.
 */
export function JoinPanel({
  space,
  onJoin,
  onLeave,
  pending,
}: {
  space: SpaceDetail;
  onJoin: (answer?: string) => void;
  onLeave: () => void;
  pending?: boolean | undefined;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [answer, setAnswer] = useState("");

  if (space.isMember) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-community-soft px-4 py-2 text-sm font-semibold text-community-ink">
          <DoorOpen className="size-4" aria-hidden="true" />
          Вы участник
        </span>
        <Button variant="ghost" size="sm" loading={pending ?? false} onClick={onLeave}>
          Выйти из пространства
        </Button>
      </div>
    );
  }

  if (space.pendingRequest) {
    return (
      <p className="inline-flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
        <Clock className="size-4" aria-hidden="true" />
        Заявка отправлена организатору — он ответит в ближайшие дни.
      </p>
    );
  }

  const needsQuestion = space.joinPolicy === "question";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={pending ?? false}
          onClick={() => (needsQuestion ? setSheetOpen(true) : onJoin())}
          className="bg-community text-community-foreground hover:bg-community/90"
        >
          Присоединиться
        </Button>
        <p className="text-xs text-muted-foreground">
          {needsQuestion
            ? "Вход через короткий вопрос организатору — так в небольших сообществах спокойнее."
            : "Свободный вход: сообщество открыто по интересам."}
        </p>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Пара слов организатору"
        description={space.joinQuestion ?? "Расскажите, почему вам интересно это сообщество."}
      >
        <p className="inline-flex items-center gap-2 rounded-2xl bg-community-soft px-3.5 py-2.5 text-xs text-community-ink">
          <ShieldQuestion className="size-4 shrink-0" aria-hidden="true" />
          Ответ видит только организатор, {space.hostName}.
        </p>
        <TextArea
          label="Ваш ответ"
          rows={4}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button
          fullWidth
          loading={pending ?? false}
          disabled={answer.trim().length < 10}
          onClick={() => {
            onJoin(answer.trim());
            setSheetOpen(false);
          }}
          className="bg-community text-community-foreground hover:bg-community/90"
        >
          Отправить заявку
        </Button>
      </BottomSheet>
    </>
  );
}
