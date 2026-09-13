import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarHeart, WifiOff } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useKeyboardInset } from "@/hooks/useKeyboardOpen";

import type { MeetingKind, Message } from "@/api";
import { Avatar, Button, TrustBadge } from "@/components/ds";
import { MeetingSheet } from "@/features/chat/components/MeetingSheet";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { SafetyMenu } from "@/features/chat/components/SafetyMenu";
import { StarterChips } from "@/features/chat/components/StarterChips";
import {
  useConversation,
  useMarkConversationRead,
  useMessageStarters,
  useMessages,
  useMessagesCache,
  useSendMessage,
  useSendVoiceMessage,
  useSuggestMeeting,
} from "@/features/chat/hooks";
import { badgeLevel } from "@/features/chat/trust";
import { useChatSocket, type ChatSocketEvent } from "@/features/chat/useChatSocket";
import { useSessionStore } from "@/store/useSessionStore";

export const Route = createFileRoute("/chat/$id")({
  head: () => ({
    meta: [
      { title: "Переписка — Я Онлайн" },
      {
        name: "description",
        content:
          "Спокойный чат с подсказками первой фразы от AI и возможностью предложить встречу.",
      },
      { property: "og:title", content: "Переписка — Я Онлайн" },
      {
        property: "og:description",
        content: "Диалог с человеком из подборки: без давления и таймеров ответа.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConversationPage,
});

/** «Сегодня», «Вчера» или дата — разделители между днями. */
function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function sameDay(a: string, b: string) {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
}

function ConversationPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const myId = useSessionStore((s) => s.user?.id);
  const { data: conversation } = useConversation(id);
  const { messages, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessages(id);
  const cache = useMessagesCache(id);
  const send = useSendMessage(id);
  const sendVoice = useSendVoiceMessage(id);
  const suggestMeeting = useSuggestMeeting(id);
  const markRead = useMarkConversationRead(id);

  const keyboardInset = useKeyboardInset();
  const [draft, setDraft] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  const isEmptyThread = (messages?.length ?? 0) === 0;
  const { data: starters, isPending: startersPending } = useMessageStarters(
    id,
    Boolean(messages) && isEmptyThread,
  );

  // Входящие события: новое сообщение сразу в ленту, «прочитано» — на мои пузыри.
  const onSocketEvent = useCallback(
    (event: ChatSocketEvent) => {
      if (event.conversationId !== id) return;
      if (event.type === "message" && event.message) {
        const incoming = event.message;
        if (incoming.authorId === myId) {
          // Своё сообщение — уже добавлено оптимистично; просто синхронизируем статус.
          cache.upsert({ ...incoming, status: incoming.status ?? "sent" });
        } else {
          cache.upsert({ ...incoming, status: incoming.status ?? "sent" });
          // Мы в диалоге — сразу помечаем прочитанным.
          markRead.mutate();
        }
        void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      }
      if (event.type === "read" && event.authorId && event.authorId !== myId && myId) {
        cache.markMineRead(myId);
      }
    },
    [id, myId, cache, markRead, queryClient],
  );

  const { typing, status: socketStatus, sendTyping } = useChatSocket({
    conversationId: id,
    onEvent: onSocketEvent,
  });

  // Сокет переподключился — за время обрыва могли прийти сообщения.
  const wasClosedRef = useRef(false);
  useEffect(() => {
    if (socketStatus === "closed") wasClosedRef.current = true;
    if (socketStatus === "open" && wasClosedRef.current) {
      wasClosedRef.current = false;
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", id] });
    }
  }, [socketStatus, id, queryClient]);

  const markReadOnce = useRef(false);
  useEffect(() => {
    if (markReadOnce.current || !conversation || conversation.unreadCount === 0) return;
    markReadOnce.current = true;
    markRead.mutate();
  }, [conversation, markRead]);

  // Автопрокрутка вниз при новых сообщениях (но не при подгрузке истории вверх).
  const lastId = messages?.[messages.length - 1]?.id;
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [lastId, typing, scrollToBottom]);

  // Клавиатура сократила видимую область — держим последнее сообщение в кадре.
  useEffect(() => {
    scrollToBottom(false);
  }, [keyboardInset, scrollToBottom]);

  // Подгрузка ранних сообщений при прокрутке к верху с сохранением позиции.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasNextPage) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || isFetchingNextPage) return;
        const prevHeight = scroller.scrollHeight;
        const prevTop = scroller.scrollTop;
        void fetchNextPage().then(() => {
          requestAnimationFrame(() => {
            scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
          });
        });
      },
      { root: scroller },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const participant = conversation?.participant;
  const shared = useMemo(() => conversation?.sharedInterests ?? [], [conversation]);

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate({ text, clientTempId: crypto.randomUUID() });
    setDraft("");
    inputRef.current?.focus();
  };

  const retry = (message: Message) => {
    if (message.kind === "voice") {
      const variables = sendVoice.variables;
      if (!sendVoice.isPending && variables && variables.clientTempId === message.clientTempId) {
        sendVoice.mutate(variables);
      }
      return;
    }
    if (send.isPending) return;
    send.mutate({
      text: message.text,
      clientTempId: message.clientTempId ?? crypto.randomUUID(),
      retryId: message.id,
    });
  };

  return (
    <div
      className="keyboard-viewport-fixed flex flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-3 py-2.5">
          <Link
            to="/chat"
            aria-label="К списку диалогов"
            className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>

          {participant ? (
            <Link
              to="/profile/$id"
              params={{ id: participant.id }}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar
                name={participant.name}
                src={participant.avatarUrl ?? null}
                online={participant.online}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{participant.name}</span>
                  <TrustBadge level={badgeLevel(participant.trustLevel)} size="sm" />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {typing
                    ? "печатает…"
                    : participant.online
                      ? "в сети"
                      : (participant.city ?? "не в сети")}
                </span>
              </span>
            </Link>
          ) : (
            <span className="flex-1 text-sm text-muted-foreground">Загружаем диалог…</span>
          )}

          <SafetyMenu
            participantName={participant?.name ?? "Собеседник"}
            participantId={participant?.id ?? "unknown"}
          />
        </div>
        {socketStatus === "closed" ? (
          <p className="flex items-center justify-center gap-1.5 border-t border-border bg-secondary/60 px-3 py-1 text-[11px] text-muted-foreground">
            <WifiOff className="size-3" aria-hidden="true" />
            Нет соединения — переподключаемся…
          </p>
        ) : null}
      </header>

      <main
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col">
        {shared.length > 0 ? (
          <p className="mb-4 rounded-2xl bg-primary-soft/50 px-4 py-2.5 text-xs text-primary-ink">
            Общее у вас: {shared.join(", ")}
          </p>
        ) : null}

        {isPending ? (
          <p className="m-auto text-sm text-muted-foreground">Загружаем сообщения…</p>
        ) : isEmptyThread ? (
          <div className="m-auto max-w-sm text-center">
            <p className="text-sm text-muted-foreground">
              Диалог ещё не начат. Напишите первое сообщение — или начните с подсказки ниже.
            </p>
          </div>
        ) : (
          <>
            <div ref={topSentinelRef} className="h-px" />
            {hasNextPage ? (
              <div className="mb-3 flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? "Загружаем…" : "Показать более ранние"}
                </Button>
              </div>
            ) : null}
            <ul className="flex-1 space-y-3">
              {messages?.map((message, index) => {
                const prev = messages[index - 1];
                const showDay = !prev || !sameDay(prev.createdAt, message.createdAt);
                return (
                  <Fragment key={message.id}>
                    {showDay ? (
                      <li className="flex justify-center py-1">
                        <span className="hud-label rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
                          {dayLabel(message.createdAt)}
                        </span>
                      </li>
                    ) : null}
                    <MessageBubble message={message} onRetry={retry} />
                  </Fragment>
                );
              })}
              {typing ? (
                <li className="flex justify-start">
                  <span className="rounded-3xl rounded-bl-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    печатает…
                  </span>
                </li>
              ) : null}
            </ul>
          </>
        )}
        </div>
      </main>

      <div
        className={`shrink-0 border-t border-border bg-card/95 backdrop-blur ${
          keyboardInset > 0 ? "pb-0" : "pb-[env(safe-area-inset-bottom)]"
        }`}
      >
        <div className="mx-auto w-full max-w-3xl">
          {isEmptyThread ? (
            <StarterChips
              starters={starters ?? []}
              loading={startersPending}
              onPick={(text) => {
                setDraft(text);
                inputRef.current?.focus();
              }}
            />
          ) : null}

          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={submit}
            onTyping={sendTyping}
            onFocus={() => scrollToBottom(false)}
            sending={send.isPending}
            voiceSending={sendVoice.isPending}
            inputRef={inputRef}
            onVoice={(recording) => {
              if (sendVoice.isPending) return;
              sendVoice.mutate({ recording, clientTempId: crypto.randomUUID() });
            }}
            leading={(
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Предложить встречу"
                onClick={() => setMeetingOpen(true)}
              >
                <CalendarHeart aria-hidden="true" />
              </Button>
            )}
          />
        </div>
      </div>

      <MeetingSheet
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        participantName={participant?.name ?? "Привет"}
        submitting={suggestMeeting.isPending}
        onSubmit={(kind: MeetingKind, text: string) => {
          suggestMeeting.mutate({ kind, text }, { onSuccess: () => setMeetingOpen(false) });
        }}
      />
    </div>
  );
}
