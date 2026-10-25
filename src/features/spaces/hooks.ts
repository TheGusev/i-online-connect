import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { spacesApi } from "@/api";
import type { SpaceDraft, SpaceEventDraft, SpaceMessage } from "@/api";
import type { VoiceRecording } from "@/features/chat/useVoiceRecorder";
import type { PreparedMedia } from "@/features/chat/media";

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

export function useUpdateSpaceCover(id: string) {
  return useSpaceMutation<File>(id, async (file) => {
    const { url } = await spacesApi.uploadSpaceCover(file);
    return spacesApi.updateSpaceCover(id, url);
  });
}

export function useEditSpaceMessage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) => spacesApi.editSpaceMessage(id, messageId, text),
    onSuccess: () => client.invalidateQueries({ queryKey: spaceMessagesQueryKey(id) }),
  });
}

export function useDeleteSpaceMessage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => spacesApi.deleteSpaceMessage(id, messageId),
    onMutate: (messageId) => {
      // Удалённое сообщение исчезает сразу, без плашки «удалено».
      client.setQueryData<SpaceMessage[]>(spaceMessagesQueryKey(id), (previous) =>
        (previous ?? []).filter((message) => message.id !== messageId),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: spaceMessagesQueryKey(id) });
      void client.invalidateQueries({ queryKey: ["gallery", "space", id] });
    },
  });
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
    refetchInterval: enabled ? 5000 : false,
  });
}

export function useSendSpaceMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: string | { text: string; replyToId?: string }) =>
      spacesApi.sendSpaceMessage(id, typeof draft === "string" ? draft : draft.text, typeof draft === "string" ? undefined : draft.replyToId),
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
    mutationFn: ({ recording, clientTempId, replyToId }: { recording: VoiceRecording; clientTempId: string; replyToId?: string }) =>
      spacesApi.sendSpaceVoiceMessage(id, recording.blob, recording.durationMs, clientTempId, false, replyToId),
    onSuccess: (message) => {
      queryClient.setQueryData<SpaceMessage[]>(spaceMessagesQueryKey(id), (previous) => [
        ...(previous ?? []),
        message,
      ]);
    },
  });
}

/** Фото и видео в общий чат сообщества. */
export function useSendSpaceMediaMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ media, clientTempId, replyToId }: { media: PreparedMedia; clientTempId: string; replyToId?: string }) =>
      spacesApi.sendSpaceMediaMessage(id, media.file, clientTempId, undefined, replyToId),
    onSuccess: (message, vars) => {
      URL.revokeObjectURL(vars.media.previewUrl);
      queryClient.setQueryData<SpaceMessage[]>(spaceMessagesQueryKey(id), (previous) => [
        ...(previous ?? []),
        message,
      ]);
      void queryClient.invalidateQueries({ queryKey: ["gallery", "space", id] });
    },
    onError: (_error, vars) => {
      URL.revokeObjectURL(vars.media.previewUrl);
    },
  });
}
