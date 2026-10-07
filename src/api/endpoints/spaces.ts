import { request, upload } from "../client";
import type {
  Space,
  SpaceDetail,
  SpaceDraft,
  SpaceEventDraft,
  SpaceInviteCandidate,
  SpaceMessage,
} from "../types";

export async function getSpaces(): Promise<Space[]> {
  return request<Space[]>("/spaces");
}

export async function getSpace(id: string): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${id}`);
}

/** Вступление: для открытых сообществ сразу, для приватных — с ответом организатору. */
export async function joinSpace(id: string, answer?: string): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${id}/join`, { method: "POST", body: { answer } });
}

export async function leaveSpace(id: string): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${id}/leave`, { method: "POST" });
}

export async function rsvpEvent(
  spaceId: string,
  eventId: string,
  going: boolean,
): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${spaceId}/events/${eventId}/rsvp`, {
    method: "POST",
    body: { going },
  });
}

/** Организатор создаёт структурированную встречу сообщества. */
export async function createSpaceEvent(
  spaceId: string,
  draft: SpaceEventDraft,
): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${spaceId}/events`, { method: "POST", body: draft });
}

export async function updateSpacePrivacy(id: string, isPrivate: boolean): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${id}/privacy`, {
    method: "PATCH",
    body: { isPrivate },
  });
}

export async function deleteSpace(id: string): Promise<void> {
  await request<void>(`/spaces/${id}`, { method: "DELETE" });
}

export async function getInviteCandidates(
  id: string,
  query: string,
): Promise<SpaceInviteCandidate[]> {
  return request<SpaceInviteCandidate[]>(`/spaces/${id}/invite-candidates`, {
    query: { q: query },
  });
}

export async function inviteToSpace(id: string, userId: string): Promise<void> {
  await request(`/spaces/${id}/invites`, { method: "POST", body: { userId } });
}

export async function declineSpaceInvite(id: string): Promise<void> {
  await request(`/spaces/${id}/invite/decline`, { method: "POST" });
}

export async function createSpace(draft: SpaceDraft): Promise<SpaceDetail> {
  return request<SpaceDetail>("/spaces", { method: "POST", body: draft });
}

/** Загрузка своей обложки для сообщества. Возвращает URL готового файла. */
export async function uploadSpaceCover(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request<{ url: string }>("/spaces/cover", { method: "POST", body: form });
}

export async function getSpaceMessages(spaceId: string): Promise<SpaceMessage[]> {
  return request<SpaceMessage[]>(`/spaces/${spaceId}/messages`);
}

export async function sendSpaceMessage(spaceId: string, text: string): Promise<SpaceMessage> {
  return request<SpaceMessage>(`/spaces/${spaceId}/messages`, { method: "POST", body: { text } });
}

export async function sendSpaceVoiceMessage(
  spaceId: string,
  recording: Blob,
  durationMs: number,
  clientTempId: string,
  live = false,
): Promise<SpaceMessage> {
  const form = new FormData();
  form.append("durationMs", String(durationMs));
  form.append("clientTempId", clientTempId);
  if (live) form.append("live", "1");
  const baseMime = recording.type.split(";")[0];
  const fileName = baseMime === "audio/webm" ? "voice.webm" : "voice.m4a";
  form.append("file", recording, fileName);
  return upload<SpaceMessage>(`/spaces/${spaceId}/voice`, form, {
    timeoutMs: 60_000,
    timeoutMessage: "Голосовое не загрузилось за минуту — попробуйте ещё раз",
  });
}

/** Фото или видео в общий чат сообщества: для подтверждённых участников. */
export async function sendSpaceMediaMessage(
  spaceId: string,
  file: File,
  clientTempId: string,
  onProgress?: (percent: number) => void,
): Promise<SpaceMessage> {
  const form = new FormData();
  form.append("clientTempId", clientTempId);
  form.append("file", file, file.name || "attachment");
  return upload<SpaceMessage>(`/spaces/${spaceId}/media`, form, {
    ...(onProgress ? { onProgress } : {}),
    timeoutMs: 180_000,
    timeoutMessage: "Вложение не загрузилось — проверьте связь и попробуйте ещё раз",
  });
}


/** Галерея: фото и видео, новые сверху. */
export async function getSpaceMedia(
  id: string,
  kind?: "image" | "video",
  before?: string | null,
): Promise<import("../types").GalleryPage> {
  const params = new URLSearchParams({ limit: "60" });
  if (kind) params.set("kind", kind);
  if (before) params.set("before", before);
  return request<import("../types").GalleryPage>(`/spaces/${id}/media?${params}`);
}
