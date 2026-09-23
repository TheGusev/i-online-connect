import { Search, UserPlus } from "lucide-react";
import { useState } from "react";

import type { SpaceInviteCandidate } from "@/api";
import { Avatar, Button, Input, Modal } from "@/components/ds";

export function SpaceInviteDialog({
  open,
  onClose,
  query,
  onQueryChange,
  candidates,
  loading,
  invitingId,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  candidates: SpaceInviteCandidate[];
  loading: boolean;
  invitingId?: string | undefined;
  onInvite: (userId: string) => void;
}) {
  const [invited, setInvited] = useState<string[]>([]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Пригласить в пространство"
      description="Найдите человека по имени. Приглашение появится у него в разделе «Мои»."
    >
      <div className="relative">
        <Input
          label="Имя человека"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
        />
        <Search className="pointer-events-none absolute right-4 top-5 size-4 text-muted-foreground" aria-hidden="true" />
      </div>

      {query.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Введите минимум две буквы имени.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Ищем людей…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Подходящих людей не найдено.</p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => {
            const done = invited.includes(candidate.id);
            return (
              <li
                key={candidate.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-background/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={candidate.name} src={candidate.avatarUrl ?? null} size="sm" />
                  <span className="truncate font-semibold text-foreground">{candidate.name}</span>
                </div>
                <Button
                  size="sm"
                  variant={done ? "secondary" : "primary"}
                  loading={invitingId === candidate.id}
                  disabled={done}
                  onClick={() => {
                    onInvite(candidate.id);
                    setInvited((current) => [...current, candidate.id]);
                  }}
                >
                  <UserPlus aria-hidden="true" />
                  {done ? "Отправлено" : "Пригласить"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}