import { USE_MOCKS, request } from "../client";
import { mockApi } from "../mocks";
import type { Space, SpaceDetail, SpaceDraft, SpaceMessage } from "../types";

export async function getSpaces(): Promise<Space[]> {
  return USE_MOCKS ? mockApi.spaces() : request<Space[]>("/spaces");
}

export async function getSpace(id: string): Promise<SpaceDetail> {
  return USE_MOCKS ? mockApi.space(id) : request<SpaceDetail>(`/spaces/${id}`);
}

/** Вступление: для открытых сообществ сразу, для приватных — с ответом организатору. */
export async function joinSpace(id: string, answer?: string): Promise<SpaceDetail> {
  if (USE_MOCKS) return mockApi.joinSpace(id, answer);
  return request<SpaceDetail>(`/spaces/${id}/join`, {
    method: "POST",
    body: { answer },
  });
}

export async function leaveSpace(id: string): Promise<SpaceDetail> {
  if (USE_MOCKS) return mockApi.leaveSpace(id);
  return request<SpaceDetail>(`/spaces/${id}/leave`, { method: "POST" });
}

export async function rsvpEvent(
  spaceId: string,
  eventId: string,
  going: boolean,
): Promise<SpaceDetail> {
  if (USE_MOCKS) return mockApi.rsvpEvent(spaceId, eventId, going);
  return request<SpaceDetail>(`/spaces/${spaceId}/events/${eventId}/rsvp`, {
    method: "POST",
    body: { going },
  });
}

export async function createSpace(draft: SpaceDraft): Promise<SpaceDetail> {
  if (USE_MOCKS) return mockApi.createSpace(draft);
  return request<SpaceDetail>("/spaces", { method: "POST", body: draft });
}

export async function getSpaceMessages(spaceId: string): Promise<SpaceMessage[]> {
  if (USE_MOCKS) return mockApi.spaceMessages(spaceId);
  return request<SpaceMessage[]>(`/spaces/${spaceId}/messages`);
}

export async function sendSpaceMessage(spaceId: string, text: string): Promise<SpaceMessage> {
  if (USE_MOCKS) return mockApi.sendSpaceMessage(spaceId, text);
  return request<SpaceMessage>(`/spaces/${spaceId}/messages`, {
    method: "POST",
    body: { text },
  });
}
