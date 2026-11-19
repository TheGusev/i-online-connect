import { createFileRoute } from "@tanstack/react-router";
import { Ban, MessageCircle, MessagesSquare, Pin, PinOff, Search, Star, StarOff, X } from "lucide-react";
import { useState } from "react";
import type { Conversation } from "@/api";

import { AppShell } from "@/components/layout/AppShell";
import { BottomSheet, Button, Input, ListItemSkeleton } from "@/components/ds";
import { ChatContactTools } from "@/features/chat/ChatContactTools";
import { RenameNoteChatButton } from "@/features/chat/NoteChatControls";
import { ConversationCard } from "@/features/chat/components/ConversationCard";
import { BlockedUsersSheet, ConversationDangerActions } from "@/features/chat/components/ChatSafetyActions";
import { useConversations, useConversationPreference } from "@/features/chat/hooks";
import { searchConversations } from "@/features/chat/chat-search";
import {
  DEFAULT_CONVERSATION_TAB,
  filterConversations,
  type ConversationTab,
} from "@/features/chat/conversation-list";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Диалоги — Я Онлайн" },
      {
        name: "description",
        content: "Личные диалоги, избранные и закреплённые чаты, переписки без ответа.",
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
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const preference = useConversationPreference();
  const [blockedOpen, setBlockedOpen] = useState(false);
  const items = searchConversations(filterConversations(conversations ?? [], tab), search);
  const target = conversations?.find((item) => item.id === selected?.id) ?? selected;
  const update = (kind: "pin" | "favorite", enabled: boolean) => {
    if (!target || preference.isPending) return;
    preference.mutate({ id: target.id, kind, enabled });
    setSelected(null);
  };

  return (
    <AppShell>
      <div data-no-swipe className="mb-3 flex items-center justify-between gap-2">
        <div role="group" aria-label="Выбор чатов" className="flex items-center gap-1">
          {([
            ["all", "Все", MessagesSquare],
            ["favorite", "Избранное", Star],
            ["awaiting", "Неотвеченные", MessageCircle],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab === value
                  ? "bg-transparent text-primary"
                  : "bg-transparent text-muted-foreground hover:text-primary"
              }`}
            >
              <Icon className="size-5" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            aria-label="Заблокированные"
            title="Заблокированные"
            aria-haspopup="dialog"
            aria-expanded={blockedOpen}
            onClick={() => setBlockedOpen(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:text-primary aria-expanded:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Ban className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={searchOpen ? "Закрыть поиск" : "Поиск по чатам"}
            title={searchOpen ? "Закрыть поиск" : "Поиск по чатам"}
            aria-expanded={searchOpen}
            aria-controls="chat-list-search"
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (searchOpen) setSearch("");
            }}
            className="inline-flex size-11 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:text-primary aria-expanded:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {searchOpen
              ? <X className="size-5" aria-hidden="true" />
              : <Search className="size-5" aria-hidden="true" />}
          </button>
          <ChatContactTools />
        </div>
      </div>
      <div id="chat-list-search" hidden={!searchOpen} className="mb-3" data-no-swipe>
        {searchOpen ? (
          <Input
            label="Поиск по чатам"
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
                setSearchOpen(false);
              }
            }}
          />
        ) : null}
      </div>
      {preference.error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {preference.error.message}
        </p>
      ) : null}
      {isPending ? (
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {search.trim()
            ? "В выбранной вкладке чатов с таким именем нет. Измените запрос или выберите «Все»."
            : tab === "favorite"
              ? "Здесь будут важные чаты"
              : tab === "awaiting"
                ? "Нет неотвеченных чатов"
                : "Пока пусто. Новые диалоги появятся здесь после первого сообщения."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <ConversationCard conversation={conversation} onActions={setSelected} />
            </li>
          ))}
        </ul>
      )}
      <BottomSheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={target?.participant.name ?? "Диалог"}
      >
        {target?.kind === "notes" ? (
          <div className="mb-2 flex items-center gap-2">
            <RenameNoteChatButton
              key={target.id}
              conversation={target}
              onDone={() => setSelected(null)}
            />
            <span className="text-sm">Переименовать заметки</span>
          </div>
        ) : null}
        <Button
          fullWidth
          variant="ghost"
          className="justify-start"
          disabled={preference.isPending}
          onClick={() => update("pin", !target?.pinned)}
        >
          {target?.pinned ? <PinOff /> : <Pin />}
          {target?.pinned ? "Открепить" : "Закрепить"}
        </Button>
        <Button
          fullWidth
          variant="ghost"
          className="justify-start"
          disabled={preference.isPending}
          onClick={() => update("favorite", !target?.favorite)}
        >
          {target?.favorite ? <StarOff /> : <Star />}
          {target?.favorite ? "Убрать из избранного" : "В избранное"}
        </Button>
        {target ? <ConversationDangerActions conversation={target} onDone={() => setSelected(null)} /> : null}
      </BottomSheet>
      <BlockedUsersSheet open={blockedOpen} onClose={() => setBlockedOpen(false)} />
    </AppShell>
  );
}
