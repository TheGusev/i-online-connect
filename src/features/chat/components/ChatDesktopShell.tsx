import { Link, useLocation } from "@tanstack/react-router";
import {
  Ban,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Pin,
  PinOff,
  Search,
  Settings,
  Star,
  StarOff,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Conversation } from "@/api";
import { BottomSheet, Button, Input, ListItemSkeleton } from "@/components/ds";
import { navItems } from "@/components/layout/nav-items";
import { ChatContactTools } from "@/features/chat/ChatContactTools";
import { searchConversations } from "@/features/chat/chat-search";
import { ChatBackground } from "@/features/chat/components/ChatBackground";
import {
  BlockedUsersSheet,
  ConversationDangerActions,
} from "@/features/chat/components/ChatSafetyActions";
import { ConversationCard } from "@/features/chat/components/ConversationCard";
import {
  DEFAULT_CONVERSATION_TAB,
  filterConversations,
  type ConversationTab,
} from "@/features/chat/conversation-list";
import {
  useConversationPreference,
  useConversations,
  useUnreadChatCount,
} from "@/features/chat/hooks";
import { RenameNoteChatButton } from "@/features/chat/NoteChatControls";
import { useTabOrder } from "@/features/navigation/useTabOrder";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/useSessionStore";

/**
 * Рабочее пространство чатов на ПК (от 1024 px): узкое меню, постоянный список
 * диалогов и, пока диалог не выбран, сводка по перепискам. Сам диалог рисует chat.$id.
 */
export function ChatDesktopShell() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeId = /^\/chat\/([^/]+)/.exec(pathname)?.[1] ?? null;
  return (
    <>
      <DesktopNavRail />
      <ChatListPane activeId={activeId} />
      {activeId === null ? <ChatStage /> : null}
    </>
  );
}

function DesktopNavRail() {
  const { t } = useTranslation();
  const authed = useSessionStore((state) => state.status === "authed");
  const { data: unread = 0 } = useUnreadChatCount(authed);
  const [tabOrder] = useTabOrder();
  const items = tabOrder
    .map((path) => navItems.find((item) => item.to === path))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));

  return (
    <nav
      aria-label="Основная навигация"
      className="chat-desk-pane chat-desk-nav items-center gap-2 py-4"
    >
      <Link to="/" aria-label={t("app.name")} title={t("app.name")} className="brand-mark mb-3">
        Я
      </Link>
      {items.map(({ to, params, labelKey, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          {...(params ? { params } : {})}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          activeProps={{ className: "bg-primary-soft text-primary-ink" }}
          className="relative grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Icon className="size-5" aria-hidden="true" />
          {to === "/chat" && unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Link>
      ))}
      <Link
        to="/settings"
        aria-label={t("nav.settings")}
        title={t("nav.settings")}
        activeProps={{ className: "bg-primary-soft text-primary-ink" }}
        className="mt-auto grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Settings className="size-5" aria-hidden="true" />
      </Link>
    </nav>
  );
}

function ChatListPane({ activeId }: { activeId: string | null }) {
  const { data: conversations, isPending } = useConversations();
  const [tab, setTab] = useState<ConversationTab>(DEFAULT_CONVERSATION_TAB);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const preference = useConversationPreference();
  const items = searchConversations(filterConversations(conversations ?? [], tab), search);
  const target = conversations?.find((item) => item.id === selected?.id) ?? selected;
  const update = (kind: "pin" | "favorite", enabled: boolean) => {
    if (!target || preference.isPending) return;
    preference.mutate({ id: target.id, kind, enabled });
    setSelected(null);
  };

  return (
    <section aria-label="Диалоги" className="chat-desk-pane chat-desk-list">
      <div className="space-y-3 border-b border-border px-4 pb-3 pt-4">
        <h1 className="text-lg font-bold tracking-tight">Диалоги</h1>
        <div data-no-swipe className="flex items-center justify-between gap-1">
          <div role="group" aria-label="Выбор чатов" className="flex items-center gap-1">
            {(
              [
                ["all", "Все", MessagesSquare],
                ["favorite", "Избранное", Star],
                ["awaiting", "Неотвеченные", MessageCircle],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === value ? "text-primary" : "text-muted-foreground hover:text-primary",
                )}
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
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary aria-expanded:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary aria-expanded:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {searchOpen ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Search className="size-5" aria-hidden="true" />
              )}
            </button>
            <ChatContactTools />
          </div>
        </div>
        <div id="chat-list-search" hidden={!searchOpen}>
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
      </div>

      {preference.error ? (
        <p role="alert" className="px-4 pt-3 text-sm text-destructive">
          {preference.error.message}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
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
          <ul className="space-y-2">
            {items.map((conversation, index) => (
              <li
                key={conversation.id}
                className={cn(
                  "rounded-[1.25rem]",
                  conversation.id === activeId && "ring-2 ring-primary/70",
                )}
              >
                <ConversationCard
                  conversation={conversation}
                  onActions={setSelected}
                  avatarLoading={index < 10 ? "eager" : "lazy"}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

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
        {target ? (
          <ConversationDangerActions conversation={target} onDone={() => setSelected(null)} />
        ) : null}
      </BottomSheet>
      <BlockedUsersSheet open={blockedOpen} onClose={() => setBlockedOpen(false)} />
    </section>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 px-4 py-3 backdrop-blur">
      <p className="text-2xl font-black tabular-nums text-primary">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Пока диалог не выбран: сводка по перепискам и быстрые переходы (без повторов списка слева). */
function ChatStage() {
  const { data: conversations = [] } = useConversations();
  const awaiting = filterConversations(conversations, "awaiting").length;
  const favorites = filterConversations(conversations, "favorite").length;
  const unread = conversations.reduce((sum, item) => sum + item.unreadCount, 0);

  return (
    <section
      aria-label="Рабочая область чатов"
      className="chat-desk-pane chat-desk-stage relative isolate"
    >
      <ChatBackground />
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-8 py-16">
          <header className="text-center">
            <MessagesSquare className="mx-auto size-10 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-2xl font-bold tracking-tight">Выберите диалог слева</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Вкладки «Избранное» и «Неотвеченные» помогут быстро найти нужный чат.
            </p>
          </header>

          <div className="grid grid-cols-3 gap-3">
            <StatTile value={unread} label="Непрочитанных" />
            <StatTile value={awaiting} label="Ждут ответа" />
            <StatTile value={favorites} label="В избранном" />
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="secondary" asChild>
              <Link to="/spaces">
                <Users />
                Сообщества
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/nearby">
                <MapPin />
                Объявления рядом
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
