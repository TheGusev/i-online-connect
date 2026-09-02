import { AlertTriangle, Ban, HeartHandshake, ShieldOff, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ReportCategory, ReportDraft } from "@/api";
import { Button, Modal, TextArea } from "@/components/ds";
import { useSubmitReport } from "@/features/trust/hooks";
import { cn } from "@/lib/utils";

const categories: {
  id: ReportCategory;
  label: string;
  hint: string;
  icon: typeof UserX;
}[] = [
  {
    id: "fake",
    label: "Фейковый профиль",
    hint: "Чужие фото, несовпадение с видео, ощущение подделки",
    icon: UserX,
  },
  {
    id: "behavior",
    label: "Неуместное поведение",
    hint: "Грубость, давление, неприятные сообщения или фото",
    icon: ShieldOff,
  },
  {
    id: "scam",
    label: "Мошенничество",
    hint: "Просят денег, ссылки на оплату, странные схемы",
    icon: AlertTriangle,
  },
  {
    id: "other",
    label: "Другое",
    hint: "Расскажи своими словами — мы прочитаем",
    icon: HeartHandshake,
  },
];

/** Универсальная форма жалобы: доступна из чата и из профиля. */
export function ReportModal({
  open,
  onClose,
  subjectId,
  subjectName,
  source,
  onBlock,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  source: ReportDraft["source"];
  onBlock?: (() => void) | undefined;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [blockToo, setBlockToo] = useState(false);
  const submit = useSubmitReport();

  const close = () => {
    onClose();
    setCategory(null);
    setDetails("");
    setBlockToo(false);
  };

  const send = () => {
    if (!category) return;
    submit.mutate(
      {
        category,
        details: details.trim(),
        subjectId,
        subjectName,
        source,
        blockToo,
      },
      {
        onSuccess: () => {
          toast.success("Жалоба получена, мы разберёмся", {
            description: blockToo
              ? `${subjectName} больше не сможет с тобой связаться. Ответ модерации — в течение суток.`
              : "Живая команда посмотрит диалог в течение суток и вернётся с ответом.",
          });
          if (blockToo) onBlock?.();
          close();
        },
        onError: () => {
          toast.error("Не получилось отправить жалобу", {
            description: "Попробуй ещё раз — мы точно хотим об этом узнать.",
          });
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Расскажи, что случилось"
      description="Мы на твоей стороне. Жалоба анонимна: человек не узнает, кто её отправил."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Отмена
          </Button>
          <Button onClick={send} loading={submit.isPending} disabled={!category}>
            Отправить
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Что произошло?</legend>
        {categories.map(({ id, label, hint, icon: Icon }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                active
                  ? "border-primary bg-primary/8"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span>
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {hint}
                </span>
              </span>
            </button>
          );
        })}
      </fieldset>

      <TextArea
        label="Что стоит знать модерации (необязательно)"
        rows={3}
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        hint="Любая деталь помогает разобраться быстрее."
      />

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary p-3.5">
        <input
          type="checkbox"
          checked={blockToo}
          onChange={(event) => setBlockToo(event.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Ban className="size-3.5" aria-hidden="true" />
            Заодно заблокировать {subjectName}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            Диалог исчезнет из списка, новые сообщения приходить не будут.
          </span>
        </span>
      </label>
    </Modal>
  );
}
