import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { spacesApi } from "@/api";
import type { SpaceDraft, SpaceMessage } from "@/api";

export const spacesQueryOptions = {
  queryKey: ["spaces"] as const,
  queryFn: () => spacesApi.getSpaces(),
};

export function useSpaces() {
  return useQuery(spacesQueryOptions);
}

export function spaceQueryKey(id: string) {
  return ["spaces", "detail", id] as const;
}

export function useSpace(id: string) {
  return useQuery({ queryKey: spaceQueryKey(id), queryFn: () => spacesApi.getSpace(id) });
}

/** Инвалидация списка и карточки после любой мутации сообщества. */
function useSpaceMutation<TArgs>(
  id: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: spaceQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}

export function useJoinSpace(id: string) {
  return useSpaceMutation<string | undefined>(id, (answer) => spacesApi.joinSpace(id, answer));
}

export function useLeaveSpace(id: string) {
  return useSpaceMutation<void>(id, () => spacesApi.leaveSpace(id));
}

export function useRsvpEvent(id: string) {
  return useSpaceMutation<{ eventId: string; going: boolean }>(id, ({ eventId, going }) =>
    spacesApi.rsvpEvent(id, eventId, going),
  );
}

export function useCreateSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: SpaceDraft) => spacesApi.createSpace(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}

export function spaceMessagesQueryKey(id: string) {
  return ["spaces", "messages", id] as const;
}

export function useSpaceMessages(id: string) {
  return useQuery({
    queryKey: spaceMessagesQueryKey(id),
    queryFn: () => spacesApi.getSpaceMessages(id),
  });
}

export function useSendSpaceMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => spacesApi.sendSpaceMessage(id, text),
    onSuccess: (message) => {
      queryClient.setQueryData<SpaceMessage[]>(spaceMessagesQueryKey(id), (previous) => [
        ...(previous ?? []),
        message,
      ]);
    },
  });
}
