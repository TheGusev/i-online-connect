import { useQuery } from "@tanstack/react-query";

import { request } from "@/api/client";
import { useSessionStore } from "@/store/useSessionStore";

interface GeoMe {
  status: "resolved" | "needs_city";
  profileCity: string;
  place: { id: string; city: string } | null;
}

/** Текущий город пользователя из того же кэша, что использует подтверждение города. */
export function useCurrentCity() {
  const status = useSessionStore((state) => state.status);
  const userId = useSessionStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: ["geo", "me", userId],
    queryFn: ({ signal }) => request<GeoMe>("/geo/me", { signal }),
    enabled: status === "authed" && Boolean(userId),
    retry: false,
  });
  const data = query.data;
  const city = data?.status === "resolved" ? (data.place?.city ?? data.profileCity) : null;
  return { city: city || null, loading: query.isLoading };
}
