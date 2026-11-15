import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Conversation } from "@/api";
import * as chatEndpoints from "@/api/endpoints/chat";
import { BottomSheet, Button } from "@/components/ds";

export function ConversationDangerActions({
  conversation,
  onDone,
}: {
  conversation: Conversation;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"block" | "delete" | null>(null);
  const name = conversation.participant.name;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["chat"] });

  const remove = async () => {
    if (!window.confirm(`Удалить чат с ${name}? История исчезнет только у вас, у собеседника она сохранится.`)) return;
    setBusy("delete");
    try {
      await chatEndpoints.deleteConversation(conversation.id);
      toast.success("Чат удалён");
      onDone();
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось удалить чат");
    } finally {
      setBusy(null);
    }
  };

  const block = async () => {
    if (!window.confirm(`Заблокировать ${name}? Диалог скроется, сообщения приходить не будут. Разблокировать можно кнопкой «Заблокированные» в списке чатов.`)) return;
    setBusy("block");
    try {
      await chatEndpoints.blockUser(conversation.participant.id);
      toast.success(`${name} заблокирован`);
      onDone();
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось заблокировать");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button fullWidth variant="ghost" className="justify-start" disabled={busy !== null} onClick={remove}>
        <Trash2 aria-hidden="true" />
        Удалить чат
      </Button>
      <Button fullWidth variant="ghost" className="justify-start text-destructive" disabled={busy !== null} onClick={block}>
        <Ban aria-hidden="true" />
        Заблокировать
      </Button>
    </>
  );
}

export function BlockedUsersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const blocked = useQuery({
    queryKey: ["chat", "blocks"],
    queryFn: () => chatEndpoints.getBlockedUsers(),
    enabled: open,
  });

  const unblock = async (id: string, name: string) => {
    setBusyId(id);
    try {
      await chatEndpoints.unblockUser(id);
      toast.success(`${name} разблокирован`);
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Не удалось разблокировать");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Заблокированные">
      {blocked.isPending ? <p className="text-sm text-muted-foreground">Загружаем…</p> : null}
      {blocked.isError ? <p className="text-sm text-destructive">Не удалось загрузить список</p> : null}
      {blocked.data && blocked.data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Вы никого не блокировали</p>
      ) : null}
      <ul className="space-y-2">
        {(blocked.data ?? []).map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
            <span className="min-w-0 truncate font-semibold">{user.name}</span>
            <Button size="sm" variant="secondary" disabled={busyId === user.id} onClick={() => unblock(user.id, user.name)}>
              Разблокировать
            </Button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
