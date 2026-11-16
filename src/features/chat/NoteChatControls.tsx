import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { request } from "@/api/client";
import type { Conversation } from "@/api";
import { BottomSheet, Button, Input } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

export function NoteChatForm({
  conversation,
  onDone,
}: {
  conversation?: Conversation;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(conversation?.participant.name ?? "Заметки");
  const requestId = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const account = useSessionStore(s => s.user?.id);

  const mutation = useMutation({
    mutationFn: async (variables: {
      title: string;
      id: string | undefined;
      account: string;
      clientTempId: string;
    }) => {
      const result = variables.id
        ? await request<{ conversationId: string }>(
            `/chat/notes/${variables.id}`,
            { method: "PATCH", body: { title: variables.title } },
          )
        : await request<{ conversationId: string }>(
            "/chat/notes",
            {
              method: "POST",
              body: {
                title: variables.title,
                clientTempId: variables.clientTempId,
              },
            },
          );
      return result;
    },
    onSuccess: async (result, variables) => {
      if (useSessionStore.getState().user?.id !== variables.account) return;
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
      if (useSessionStore.getState().user?.id !== variables.account) return;
      onDone();
      if (!variables.id) {
        await navigate({
          to: "/chat/$id",
          params: { id: result.conversationId },
        });
      }
    },
  });

  return (
    <form
      className="space-y-4"
      data-no-swipe
      onSubmit={event => {
        event.preventDefault();
        if (!account || mutation.isPending || !title.trim()) return;
        requestId.current ??= crypto.randomUUID();
        mutation.mutate({
          title: title.trim(),
          id: conversation?.id,
          account,
          clientTempId: requestId.current,
        });
      }}
    >
      <Input
        label="Название чата"
        value={title}
        maxLength={80}
        autoFocus
        disabled={mutation.isPending}
        onChange={event => {
          setTitle(event.target.value);
          requestId.current = null;
          mutation.reset();
        }}
      />
      <p className="text-sm text-muted-foreground">
        Личный чат для записей. Других участников здесь нет.
      </p>
      {mutation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Не удалось сохранить чат"}
        </p>
      ) : null}
      <Button
        type="submit"
        fullWidth
        disabled={!account || !title.trim() || mutation.isPending}
      >
        {mutation.isPending
          ? "Сохраняем…"
          : conversation
            ? "Сохранить название"
            : "Создать чат"}
      </Button>
    </form>
  );
}

export function RenameNoteChatButton({
  conversation,
  onDone,
}: {
  conversation: Conversation;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (conversation.kind !== "notes") return null;
  return (
    <>
      <Button
        variant="ghost"
        aria-label="Переименовать заметки"
        title="Переименовать заметки"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-5" aria-hidden="true" />
        <span className="sr-only">Переименовать заметки</span>
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Название заметок"
      >
        {open ? (
          <NoteChatForm
            key={conversation.id}
            conversation={conversation}
            onDone={() => {
              setOpen(false);
              onDone?.();
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}
