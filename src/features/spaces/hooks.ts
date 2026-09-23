import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { spacesApi } from "@/api";
import type { SpaceDraft, SpaceEventDraft, SpaceMessage } from "@/api";
import type { VoiceRecording } from "@/features/chat/useVoiceRecorder";

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
function useSpaceMutation<TArgs>(id: string, mutationFn: (args: TArgs) => Promise<unknown>) {
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

export function useCreateSpaceEvent(id: string) {
  return useSpaceMutation<SpaceEventDraft>(id, (draft) => spacesApi.createSpaceEvent(id, draft));
}

export function useUpdateSpacePrivacy(id: string) {
  return useSpaceMutation<boolean>(id, (isPrivate) => spacesApi.updateSpacePrivacy(id, isPrivate));
}

export function useDeleteSpace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => spacesApi.deleteSpace(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: spaceQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}

export function useInviteCandidates(id: string, query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["spaces", id, "invite-candidates", query] as const,
    queryFn: () => spacesApi.getInviteCandidates(id, query),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 15_000,
  });
}

export function useInviteToSpace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => spacesApi.inviteToSpace(id, userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["spaces", id, "invite-candidates"] }),
  });
}

export function useDeclineSpaceInvite(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => spacesApi.declineSpaceInvite(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
      void queryClient.invalidateQueries({ queryKey: spaceQueryKey(id) });
    },
  });
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

export function useSpaceMessages(id: string, enabled = true) {
  return useQuery({
    queryKey: spaceMessagesQueryKey(id),
    queryFn: () => spacesApi.getSpaceMessages(id),
    enabled,
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

export function useSendSpaceVoiceMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recording, clientTempId }: { recording: VoiceRecording; clientTempId: string }) =>
      spacesApi.sendSpaceVoiceMessage(id, recording.blob, recording.durationMs, clientTempId),
    onSuccess: (message) => {
      queryClient.setQueryData<SpaceMessage[]>(spaceMessagesQueryKey(id), (previous) => [
        ...(previous ?? []),
        message,
      ]);
    },
  });
}
