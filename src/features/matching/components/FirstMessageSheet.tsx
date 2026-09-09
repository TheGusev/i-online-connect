import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { chatApi } from "@/api";
import type { DailyMatch } from "@/api";
import { BottomSheet, Button, TextArea } from "@/components/ds";

/** Начало диалога: AI предлагает первое сообщение, его можно поправить. */
export function FirstMessageSheet({
  match,
  open,
  onClose,
  conversationId,
}: {
  match: DailyMatch | null;
  open: boolean;
  onClose: () => void;
  /** Диалог, созданный при взаимном лайке; если нет — откроем сами. */
  conversationId?: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (match) setText(t("feed.firstMessage.draft", { name: match.name }));
  }, [match, t]);

  if (!match) return null;

  const sendAndOpen = async () => {
    if (sending) return;
    setSending(true);
    try {
      const id = conversationId ?? (await chatApi.openConversation(match.id)).conversationId;
      const body = text.trim();
      if (body) await chatApi.sendMessage(id, body);
      void queryClient.invalidateQueries({ queryKey: ["chat"] });
      onClose();
      void navigate({ to: "/chat/$id", params: { id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть диалог");
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("feed.firstMessage.title", { name: match.name })}
      description={t("feed.firstMessage.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("feed.firstMessage.later")}
          </Button>
          <Button variant="primary" onClick={() => void sendAndOpen()} disabled={sending}>
            {sending ? "Отправляем…" : t("feed.firstMessage.send")}
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-primary-soft p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("feed.firstMessage.hint")}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">{match.firstMessageHint}</p>
      </div>
      <TextArea
        label={t("feed.firstMessage.label")}
        value={text}
        rows={4}
        onChange={(event) => setText(event.target.value)}
      />
    </BottomSheet>
  );
}
