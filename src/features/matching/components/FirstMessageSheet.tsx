import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DailyMatch } from "@/api";
import { BottomSheet, Button, TextArea } from "@/components/ds";

/** Начало диалога: AI предлагает первое сообщение, его можно поправить. */
export function FirstMessageSheet({
  match,
  open,
  onClose,
}: {
  match: DailyMatch | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  useEffect(() => {
    if (match) setText(t("feed.firstMessage.draft", { name: match.name }));
  }, [match, t]);

  if (!match) return null;

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
          <Button asChild variant="primary">
            <Link to="/chat" onClick={onClose}>
              {t("feed.firstMessage.send")}
            </Link>
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
