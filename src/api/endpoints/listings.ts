import type {
  Listing,
  ListingDraft,
  ListingSearchResult,
  NeedCategory,
} from "../types";
import { request } from "../client";

/** Поиск объявлений. Без city сервер подставит город из профиля. */
export async function searchListings(params: {
  city?: string;
  category?: NeedCategory;
  q?: string;
  limit?: number;
  onlyMyNeeds?: boolean;
} = {}): Promise<ListingSearchResult> {
  return request<ListingSearchResult>("/listings", { query: params });
}

export async function getMyListings(): Promise<Listing[]> {
  return request<Listing[]>("/listings/mine");
}

export async function getListing(id: string): Promise<Listing> {
  return request<Listing>(`/listings/${id}`);
}

export async function createListing(draft: ListingDraft): Promise<Listing> {
  return request<Listing>("/listings", { method: "POST", body: draft });
}

export async function updateListing(
  id: string,
  patch: Partial<Pick<Listing, "title" | "description" | "priceMinor">> & {
    state?: "active" | "closed";
    mediaIds?: string[];
  },
): Promise<Listing> {
  return request<Listing>(`/listings/${id}`, { method: "PATCH", body: patch });
}

export async function closeListing(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/listings/${id}/close`, { method: "POST" });
}

/** Отклик открывает обычный диалог — отдельного чата объявлений нет. */
export async function respondToListing(
  id: string,
  text?: string,
): Promise<{ conversationId: string; created: boolean }> {
  return request<{ conversationId: string; created: boolean }>(`/listings/${id}/respond`, {
    method: "POST",
    body: text ? { text } : {},
  });
}

export async function getMyNeeds(): Promise<{ categories: NeedCategory[] }> {
  return request<{ categories: NeedCategory[] }>("/listings/needs");
}

export async function setMyNeeds(
  categories: NeedCategory[],
): Promise<{ categories: NeedCategory[] }> {
  return request<{ categories: NeedCategory[] }>("/listings/needs", {
    method: "PUT",
    body: { categories },
  });
}
