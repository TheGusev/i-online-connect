import { createFileRoute } from "@tanstack/react-router";
import { Pin, PinOff, Star, StarOff } from "lucide-react";
import { useState } from "react";
import type { Conversation } from "@/api";

import { AppShell } from "@/components/layout/AppShell";
import { BottomSheet, Button, Chip, ListItemSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { ConversationCard } from "@/features/chat/components/ConversationCard";
import { useConversations, useConversationPreference } from "@/features/chat/hooks";
import { DEFAULT_CONVERSATION_TAB, filterConversations, type ConversationTab } from "@/features/chat/conversation-list";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Диалоги — Я Онлайн" },
      {
        name: "description",
        content:
          "Личные диалоги, избранные и закреплённые чаты, переписки без ответа.",
      },
      { property: "og:title", content: "Диалоги — Я Онлайн" },
      {
        property: "og:description",
        content: "Все переписки в одном месте, без таймеров и стриков.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatListPage,
});

function ChatListPage() {
  const { data: conversations, isPending } = useConversations();
  const [tab, setTab] = useState<ConversationTab>(DEFAULT_CONVERSATION_TAB);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const preference = useConversationPreference();
  const items = filterConversations(conversations ?? [], tab);
  const target = conversations?.find(item => item.id === selected?.id) ?? selected;
  const update = (kind: "pin" | "favorite", enabled: boolean) => {
    if (!target || preference.isPending) return;
    preference.mutate({ id: target.id, kind, enabled });
    setSelected(null);
  };

  return (
    <AppShell>
      <div data-no-swipe className="mb-4 flex flex-wrap gap-2" aria-label="Выбор чатов">
        {([ ["all", "Все"], ["favorite", "Избранное"], ["awaiting", "Неотвеченные"] ] as const).map(([value, label]) => (
          <Chip key={value} selected={tab === value} onClick={() => setTab(value)} size="sm">{label}</Chip>
        ))}
      </div>
      {preference.error ? <p role="alert" className="mb-3 text-sm text-destructive">{preference.error.message}</p> : null}
      {isPending ? (
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      ) : (
        items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tab === "favorite" ? "Здесь будут важные чаты" : tab === "awaiting" ? "Нет неотвеченных чатов" : "Пока пусто. Новые диалоги появятся здесь после первого сообщения."}
          </p>
        ) : <ul className="space-y-2.5">
          {items.map((conversation, index) => (
            <Reveal as="li" key={conversation.id} delay={index * 60}>
              <ConversationCard conversation={conversation} onActions={setSelected} />
            </Reveal>
          ))}
        </ul>
      )}
      <BottomSheet open={Boolean(selected)} onClose={() => setSelected(null)} title={target?.participant.name ?? "Диалог"}>
        <Button fullWidth variant="ghost" className="justify-start" disabled={preference.isPending} onClick={() => update("pin", !target?.pinned)}>
          {target?.pinned ? <PinOff /> : <Pin />}{target?.pinned ? "Открепить" : "Закрепить"}
        </Button>
        <Button fullWidth variant="ghost" className="justify-start" disabled={preference.isPending} onClick={() => update("favorite", !target?.favorite)}>
          {target?.favorite ? <StarOff /> : <Star />}{target?.favorite ? "Убрать из избранного" : "В избранное"}
        </Button>
      </BottomSheet>
    </AppShell>
  );
}
