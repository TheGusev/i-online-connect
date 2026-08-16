import { useQuery } from "@tanstack/react-query";

import { profileApi } from "@/api";

export function profileQueryOptions(id: string) {
  return {
    queryKey: ["profile", id] as const,
    queryFn: () => profileApi.getProfile(id),
  };
}

export function useProfile(id: string) {
  return useQuery(profileQueryOptions(id));
}
