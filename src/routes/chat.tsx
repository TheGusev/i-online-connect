import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { useConversations, useMessages } from "@/features/chat/hooks";
import { useUiStore } from "@/store/useUiStore";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Чат — Я Онлайн" },
      {
        name: "description",
        content: "Диалоги с людьми, с которыми у вас совпадение, в одном спокойном месте.",
      },
      { property: "og:title", content: "Чат — Я Онлайн" },
      { property: "og:description", content: "Ваши диалоги и переписка на платформе «Я Онлайн»." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { t } = useTranslation();
  const activeId = useUiStore((state) => state.activeConversationId);
  const setActiveId = useUiStore((state) => state.setActiveConversationId);
  const { data: conversations, isPending } = useConversations();
  const { data: messages } = useMessages(activeId);

  return (
    <AppShell>
      <PageHeader title={t("chat.title")} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
        <div className="rounded-lg border border-border">
          <p className="border-b border-border px-3 py-2 text-xs uppercase text-muted-foreground">
            {t("chat.conversations")}
          </p>
          {isPending ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("app.loading")}</p>
          ) : null}
          <ul>
            {conversations?.map((conversation) => (
              <li key={conversation.id}>
                <button
                  onClick={() => setActiveId(conversation.id)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    activeId === conversation.id ? "bg-accent" : ""
                  }`}
                >
                  <span className="font-medium">{conversation.participant.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {conversation.lastMessage}
                  </span>
                  {conversation.unreadCount > 0 ? (
                    <span className="text-xs text-primary">
                      {t("chat.unread", { count: conversation.unreadCount })}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-h-64 flex-col rounded-lg border border-border p-3">
          {!activeId ? (
            <p className="m-auto text-sm text-muted-foreground">{t("chat.selectConversation")}</p>
          ) : (
            <>
              <ul className="flex-1 space-y-2">
                {messages?.map((message) => (
                  <li
                    key={message.id}
                    className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                      message.authorId === "me"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {message.text}
                  </li>
                ))}
              </ul>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => event.preventDefault()}
              >
                <input
                  placeholder={t("chat.placeholder")}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {t("chat.send")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
