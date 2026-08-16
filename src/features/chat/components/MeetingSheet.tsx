import { Coffee, Footprints, Ticket } from "lucide-react";
import { useEffect, useState } from "react";

import type { MeetingKind } from "@/api";
import { BottomSheet, Button, TextArea } from "@/components/ds";
import { cn } from "@/lib/utils";

const kinds: { id: MeetingKind; label: string; icon: typeof Coffee }[] = [
  { id: "coffee", label: "Кофе", icon: Coffee },
  { id: "walk", label: "Прогулка", icon: Footprints },
  { id: "event", label: "Событие из Spaces", icon: Ticket },
];

function template(kind: MeetingKind, name: string) {
  if (kind === "coffee") {
    return `${name}, мне приятно с тобой переписываться. Если тебе комфортно, предлагаю выпить кофе в спокойном месте в центре — час-полтора, без обязательств. Скажи, какой день тебе удобнее?`;
  }
  if (kind === "walk") {
    return `${name}, было бы здорово продолжить разговор вживую. Может, прогуляемся по парку в выходные? Если для первого раза это рано — совсем не настаиваю.`;
  }
  return `${name}, в Spaces есть встреча, которая мне кажется как раз про нас обоих. Хочешь пойти вместе? Там будут другие люди, так что формат спокойный и безопасный.`;
}

/** Мини-форма «Предложить встречу» с вежливым шаблоном, который можно поправить. */
export function MeetingSheet({
  open,
  onClose,
  participantName,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  participantName: string;
  onSubmit: (kind: MeetingKind, text: string) => void;
  submitting: boolean;
}) {
  const [kind, setKind] = useState<MeetingKind>("coffee");
  const [text, setText] = useState(() => template("coffee", participantName));

  useEffect(() => {
    if (open) {
      setKind("coffee");
      setText(template("coffee", participantName));
    }
  }, [open, participantName]);

  const pickKind = (next: MeetingKind) => {
    setKind(next);
    setText(template(next, participantName));
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Предложить встречу"
      description="Выберите формат — текст приглашения можно отредактировать."
      footer={
        <>
          <Button
            fullWidth
            loading={submitting}
            onClick={() => onSubmit(kind, text.trim())}
            disabled={!text.trim()}
          >
            Отправить приглашение
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Отмена
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {kinds.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => pickKind(id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-medium transition-colors",
              kind === id
                ? "border-primary bg-primary-soft text-accent-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <TextArea
        label="Текст приглашения"
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </BottomSheet>
  );
}
