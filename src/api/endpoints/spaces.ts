import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { Space } from "../types";

export async function getSpaces(): Promise<Space[]> {
  return USE_MOCK ? mockApi.spaces() : request<Space[]>("/spaces");
}

export async function joinSpace(id: string): Promise<{ joined: boolean }> {
  if (USE_MOCK) return { joined: true };
  return request<{ joined: boolean }>(`/spaces/${id}/join`, { method: "POST" });
}
