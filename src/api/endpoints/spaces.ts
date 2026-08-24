import { request } from "../client";
import type { Space, SpaceDetail, SpaceDraft, SpaceMessage } from "../types";

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

export async function createSpace(draft: SpaceDraft): Promise<SpaceDetail> {
  return request<SpaceDetail>("/spaces", { method: "POST", body: draft });
}

export async function getSpaceMessages(spaceId: string): Promise<SpaceMessage[]> {
  return request<SpaceMessage[]>(`/spaces/${spaceId}/messages`);
}

export async function sendSpaceMessage(spaceId: string, text: string): Promise<SpaceMessage> {
  return request<SpaceMessage>(`/spaces/${spaceId}/messages`, { method: "POST", body: { text } });
}
