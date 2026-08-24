import { request } from "../client";
import type { DailyFeed, MatchCandidate } from "../types";

export async function getCandidates(): Promise<MatchCandidate[]> {
  return request<MatchCandidate[]>("/matching/candidates");
}

/** Ограниченная дневная подборка (5 совпадений в день). */
export async function getDailyFeed(): Promise<DailyFeed> {
  return request<DailyFeed>("/matching/daily");
}

export async function reactToCandidate(
  id: string,
  reaction: "like" | "skip" | "save",
): Promise<{ matched: boolean }> {
  return request<{ matched: boolean }>(`/matching/candidates/${id}/reaction`, {
    method: "POST",
    body: { reaction },
  });
}
