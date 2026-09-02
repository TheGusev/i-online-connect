import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listingsApi } from "@/api";
import type { Listing, ListingDraft, NeedCategory } from "@/api";

export interface ListingFilters {
  city?: string | undefined;
  category?: NeedCategory | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

export function listingsQueryKey(filters: ListingFilters) {
  return ["listings", filters] as const;
}

export function useListings(filters: ListingFilters, enabled = true) {
  return useQuery({
    queryKey: listingsQueryKey(filters),
    queryFn: () =>
      listingsApi.searchListings({
        ...(filters.city ? { city: filters.city } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.limit ? { limit: filters.limit } : {}),
      }),
    enabled,
  });
}

export function listingQueryKey(id: string) {
  return ["listings", "detail", id] as const;
}

export function useListing(id: string) {
  return useQuery({ queryKey: listingQueryKey(id), queryFn: () => listingsApi.getListing(id) });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: ListingDraft) => listingsApi.createListing(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Partial<Pick<Listing, "title" | "description" | "priceMinor">> & {
        state?: "active" | "closed";
      },
    ) => listingsApi.updateListing(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function useCloseListing(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => listingsApi.closeListing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function useRespondToListing(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text?: string) => listingsApi.respondToListing(id, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listingQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export const needsQueryKey = ["listings", "needs"] as const;

export function useMyNeeds() {
  return useQuery({ queryKey: needsQueryKey, queryFn: () => listingsApi.getMyNeeds() });
}

export function useSaveMyNeeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categories: NeedCategory[]) => listingsApi.setMyNeeds(categories),
    onSuccess: (data) => {
      queryClient.setQueryData(needsQueryKey, data);
      void queryClient.invalidateQueries({ queryKey: needsQueryKey });
    },
  });
}
