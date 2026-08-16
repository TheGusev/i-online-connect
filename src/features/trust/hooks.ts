import { useQuery } from "@tanstack/react-query";

import { trustApi } from "@/api";

export const trustQueryOptions = {
  queryKey: ["trust", "summary"] as const,
  queryFn: () => trustApi.getTrustSummary(),
};

export function useTrustSummary() {
  return useQuery(trustQueryOptions);
}
