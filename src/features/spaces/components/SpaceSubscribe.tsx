import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { spacesApi, type Space } from "@/api";
import { cn } from "@/lib/utils";

/** Подписка прямо на карточке: тапы не открывают пространство. */
export function SpaceSubscribe({ space }: { space: Space }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (join: boolean) => (join ? spacesApi.joinSpace(space.id) : spacesApi.leaveSpace(space.id)),
    onMutate: async (join) => {
      await queryClient.cancelQueries({ queryKey: ["spaces"], exact: true });
      const previous = queryClient.getQueryData<Space[]>(["spaces"]);
      queryClient.setQueryData<Space[]>(["spaces"], (list) =>
        list?.map((s) =>
          s.id === space.id
            ? { ...s, isMember: join, membersCount: Math.max(0, s.membersCount + (join ? 1 : -1)) }
            : s,
        ),
      );
      return { previous };
    },
    onError: (error, _join, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["spaces"], ctx.previous);
      toast.error(error instanceof Error ? error.message : "Не удалось выполнить действие");
    },
    onSuccess: (_d, join) => toast.success(join ? "Вы подписались" : "Вы вышли из пространства"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["spaces"] }),
  });

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (space.isMember) {
    return (
      <span className="inline-flex items-center gap-1" onClick={stop}>
        <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-primary" aria-label="Вы участник">
          <Check className="size-3.5" />
        </span>
        {!space.isHost ? (
          <button
            type="button"
            aria-label="Отписаться"
            disabled={mutation.isPending}
            onClick={(e) => {
              stop(e);
              if (window.confirm("Выйти из пространства?")) mutation.mutate(false);
            }}
            className="grid size-7 place-items-center rounded-full border border-border text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </span>
    );
  }

  // Вход по вопросу или по приглашению — через страницу пространства.
  if (space.joinPolicy !== "open" || (space.isPrivate && !space.invited) || space.pendingRequest) return null;

  return (
    <button
      type="button"
      disabled={mutation.isPending}
      onClick={(e) => {
        stop(e);
        mutation.mutate(true);
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-glow",
        mutation.isPending && "opacity-60",
      )}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      Подписаться
    </button>
  );
}
