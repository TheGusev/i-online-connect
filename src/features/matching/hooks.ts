import { useMutation, useQuery } from "@tanstack/react-query";

import { matchingApi } from "@/api";

export const candidatesQueryOptions = {
  queryKey: ["matching", "candidates"] as const,
  queryFn: () => matchingApi.getCandidates(),
};

export function useCandidates() {
  return useQuery(candidatesQueryOptions);
}

export const dailyFeedQueryOptions = {
  queryKey: ["matching", "daily"] as const,
  queryFn: () => matchingApi.getDailyFeed(),
};

export function useDailyFeed() {
  return useQuery(dailyFeedQueryOptions);
}

export function useCandidateReaction() {
  return useMutation({
    mutationFn: ({ id, reaction }: { id: string; reaction: "like" | "skip" | "save" }) =>
      matchingApi.reactToCandidate(id, reaction),
  });
}
