import { request, upload } from "../client";
import type {
  LiveCard,
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

export async function updateSpaceCover(id: string, coverUrl: string): Promise<SpaceDetail> {
  return request<SpaceDetail>(`/spaces/${id}/cover`, { method: "PATCH", body: { coverUrl } });
}

export async function editSpaceMessage(spaceId: string, messageId: string, text: string): Promise<SpaceMessage> {
  return request<SpaceMessage>(`/spaces/${spaceId}/messages/${messageId}`, { method: "PATCH", body: { text } });
}

export async function deleteSpaceMessage(spaceId: string, messageId: string): Promise<void> {
  await request(`/spaces/${spaceId}/messages/${messageId}`, { method: "DELETE" });
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

export async function sendSpaceMessage(spaceId: string, text: string, replyToId?: string): Promise<SpaceMessage> {
  return request<SpaceMessage>(`/spaces/${spaceId}/messages`, { method: "POST", body: { text, replyToId } });
}

export async function sendSpaceVoiceMessage(
  spaceId: string,
  recording: Blob,
  durationMs: number,
  clientTempId: string,
  live = false,
  replyToId?: string,
): Promise<SpaceMessage> {
  const form = new FormData();
  form.append("durationMs", String(durationMs));
  form.append("clientTempId", clientTempId);
  if (live) form.append("live", "1");
  if (replyToId) form.append("replyToId", replyToId);
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
  replyToId?: string,
): Promise<SpaceMessage> {
  const form = new FormData();
  form.append("clientTempId", clientTempId);
  if (replyToId) form.append("replyToId", replyToId);
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

export async function setSpaceReaction(spaceId: string, messageId: string, emoji: string, action: "put" | "delete") {
  return request<{ messageId: string; reactions: import("../types").MessageReaction[] }>(
    `/spaces/${spaceId}/messages/${messageId}/reactions`,
    { method: action === "put" ? "PUT" : "DELETE", body: { emoji } },
  );
}

/** Карточки «стола» эфира. 409 — эфир уже завершён. */
export async function getLiveCards(spaceId: string): Promise<{ active: boolean; cards: LiveCard[] }> {
  return request<{ active: boolean; cards: LiveCard[] }>(`/spaces/${spaceId}/live/cards`);
}

export async function addLiveCard(
  spaceId: string,
  input: { kind: "note" | "link" | "question"; text?: string; url?: string; clientTempId: string },
): Promise<LiveCard> {
  return request<LiveCard>(`/spaces/${spaceId}/live/cards`, { method: "POST", body: input });
}

export async function addLivePhotoCard(spaceId: string, file: File, clientTempId: string): Promise<LiveCard> {
  const form = new FormData();
  form.append("kind", "photo");
  form.append("clientTempId", clientTempId);
  form.append("file", file, file.name || "photo.jpg");
  return upload<LiveCard>(`/spaces/${spaceId}/live/cards`, form, { timeoutMs: 60_000, timeoutMessage: "Фото не загрузилось за минуту — попробуйте ещё раз" });
}

export async function updateLiveCard(spaceId: string, cardId: string, status: LiveCard["status"]): Promise<LiveCard> {
  return request<LiveCard>(`/spaces/${spaceId}/live/cards/${cardId}`, { method: "PATCH", body: { status } });
}

export async function deleteLiveCard(spaceId: string, cardId: string): Promise<{ ok: true; id: string }> {
  return request<{ ok: true; id: string }>(`/spaces/${spaceId}/live/cards/${cardId}`, { method: "DELETE" });
}
