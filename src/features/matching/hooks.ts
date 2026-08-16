import { useQuery } from "@tanstack/react-query";

import { matchingApi } from "@/api";

export const candidatesQueryOptions = {
  queryKey: ["matching", "candidates"] as const,
  queryFn: () => matchingApi.getCandidates(),
};

export function useCandidates() {
  return useQuery(candidatesQueryOptions);
}
