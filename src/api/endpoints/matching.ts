import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { DailyFeed, MatchCandidate } from "../types";

export async function getCandidates(): Promise<MatchCandidate[]> {
  return USE_MOCK ? mockApi.candidates() : request<MatchCandidate[]>("/matching/candidates");
}

/** Ограниченная дневная подборка (5 совпадений в день). */
export async function getDailyFeed(): Promise<DailyFeed> {
  return USE_MOCK ? mockApi.dailyFeed() : request<DailyFeed>("/matching/daily");
}

export async function reactToCandidate(
  id: string,
  reaction: "like" | "skip" | "save",
): Promise<{ matched: boolean }> {
  if (USE_MOCK) return { matched: reaction === "like" };
  return request<{ matched: boolean }>(`/matching/candidates/${id}/reaction`, {
    method: "POST",
    body: { reaction },
  });
}
