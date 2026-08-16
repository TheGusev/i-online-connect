import { useQuery } from "@tanstack/react-query";

import { spacesApi } from "@/api";

export const spacesQueryOptions = {
  queryKey: ["spaces"] as const,
  queryFn: () => spacesApi.getSpaces(),
};

export function useSpaces() {
  return useQuery(spacesQueryOptions);
}
