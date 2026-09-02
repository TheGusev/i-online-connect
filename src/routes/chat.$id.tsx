import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarHeart, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MeetingKind } from "@/api";
import { Avatar, Button, TrustBadge } from "@/components/ds";
import { MeetingSheet } from "@/features/chat/components/MeetingSheet";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { SafetyMenu } from "@/features/chat/components/SafetyMenu";
import { StarterChips } from "@/features/chat/components/StarterChips";
import {
  useConversation,
  useMarkConversationRead,
  useMessageStarters,
  useMessages,
  useSendMessage,
  useSuggestMeeting,
} from "@/features/chat/hooks";
import { badgeLevel } from "@/features/chat/trust";
import { useChatSocket } from "@/features/chat/useChatSocket";

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

function ConversationPage() {
  const { id } = Route.useParams();
  const { data: conversation } = useConversation(id);
  const { data: messages, isPending } = useMessages(id);
  const send = useSendMessage(id);
  const suggestMeeting = useSuggestMeeting(id);
  const markRead = useMarkConversationRead(id);

  const [draft, setDraft] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isEmptyThread = (messages?.length ?? 0) === 0;
  const { data: starters, isPending: startersPending } = useMessageStarters(
    id,
    Boolean(messages) && isEmptyThread,
  );

  const { typing } = useChatSocket({ conversationId: id });

  const markReadOnce = useRef(false);
  useEffect(() => {
    if (markReadOnce.current || !conversation || conversation.unreadCount === 0) return;
    markReadOnce.current = true;
    markRead.mutate();
  }, [conversation, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, typing]);

  const participant = conversation?.participant;
  const shared = useMemo(() => conversation?.sharedInterests ?? [], [conversation]);

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
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
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-4">
        {shared.length > 0 ? (
          <p className="mb-4 rounded-2xl bg-primary-soft/50 px-4 py-2.5 text-xs text-accent-foreground">
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
          <ul className="flex-1 space-y-3">
            {messages?.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {typing ? (
              <li className="flex justify-start">
                <span className="rounded-3xl rounded-bl-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  печатает…
                </span>
              </li>
            ) : null}
          </ul>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
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

          <form
            className="flex items-end gap-2 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Предложить встречу"
              onClick={() => setMeetingOpen(true)}
            >
              <CalendarHeart aria-hidden="true" />
            </Button>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Напишите сообщение…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-input bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" aria-label="Отправить" disabled={!draft.trim()}>
              <SendHorizontal aria-hidden="true" />
            </Button>
          </form>
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
