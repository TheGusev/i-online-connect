import { createFileRoute } from "@tanstack/react-router";
import { Inbox, MessagesSquare } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { ListItemSkeleton } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { ConversationCard } from "@/features/chat/components/ConversationCard";
import { useConversations } from "@/features/chat/hooks";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Диалоги — Я Онлайн" },
      {
        name: "description",
        content:
          "Спокойный список диалогов: сначала люди, которым вы ещё не ответили, затем активные переписки.",
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

  const awaiting = conversations?.filter((item) => item.awaitingReply) ?? [];
  const active = conversations?.filter((item) => !item.awaitingReply) ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Диалоги"
        description="Никаких таймеров ответа: отвечайте, когда у вас есть силы на разговор."
      />

      {isPending ? (
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      ) : (
        <div className="space-y-8">
          {awaiting.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Inbox className="size-4" aria-hidden="true" />
                Ожидают ответа
              </h2>
              <ul className="space-y-3">
                {awaiting.map((conversation, index) => (
                  <Reveal as="li" key={conversation.id} delay={index * 60}>
                    <ConversationCard conversation={conversation} />
                  </Reveal>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <MessagesSquare className="size-4" aria-hidden="true" />
              Активные диалоги
            </h2>
            {active.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Пока пусто. Новые диалоги появятся здесь после первого сообщения.
              </p>
            ) : (
              <ul className="space-y-3">
                {active.map((conversation, index) => (
                  <Reveal as="li" key={conversation.id} delay={index * 60}>
                    <ConversationCard conversation={conversation} />
                  </Reveal>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
