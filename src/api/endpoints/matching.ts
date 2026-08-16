import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { MatchCandidate } from "../types";

export async function getCandidates(): Promise<MatchCandidate[]> {
  return USE_MOCK ? mockApi.candidates() : request<MatchCandidate[]>("/matching/candidates");
}

export async function reactToCandidate(
  id: string,
  reaction: "like" | "skip",
): Promise<{ matched: boolean }> {
  if (USE_MOCK) return { matched: reaction === "like" };
  return request<{ matched: boolean }>(`/matching/candidates/${id}/reaction`, {
    method: "POST",
    body: { reaction },
  });
}
