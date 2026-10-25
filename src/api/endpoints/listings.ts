import type { Listing, ListingDraft, ListingSearchResult, NeedCategory } from "../types";
import { request, upload } from "../client";

/** Фото объявления. Хранится отдельно от фото профиля и в галерею не попадает. */
export interface ListingPhoto {
  id: string;
  kind: "photo";
  url: string;
  createdAt: string;
}

export async function uploadListingPhoto(
  file: File,
  fileName?: string,
  onProgress?: (percent: number) => void,
): Promise<ListingPhoto> {
  const form = new FormData();
  form.append("file", file, fileName ?? file.name);
  return upload<ListingPhoto>("/listings/media", form, onProgress ?? (() => undefined));
}

/** Поиск объявлений. Без city сервер подставит город из профиля. */
export async function searchListings(
  params: {
    city?: string;
    category?: NeedCategory;
    q?: string;
    limit?: number;
    onlyMyNeeds?: boolean;
  } = {},
): Promise<ListingSearchResult> {
  return request<ListingSearchResult>("/listings", { query: params });
}

export async function getMyListings(): Promise<Listing[]> {
  return request<Listing[]>("/listings/mine");
}

/** Публичная витрина объявлений пользователя: активные и завершённые. */
export async function getUserListings(userId: string): Promise<Listing[]> {
  return request<Listing[]>(`/listings/user/${userId}`);
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

export function watchListing(id: string, watch: boolean) {
  return request<{ ok: true }>(`/listings/${id}/watch`, { method: watch ? "POST" : "DELETE" });
}
export function setListingBid(id: string, maxPriceMinor: number | null) {
  return request<{ ok: true; myBid?: { maxPriceMinor: number } }>(`/listings/${id}/bid`, {
    method: maxPriceMinor === null ? "DELETE" : "PUT",
    ...(maxPriceMinor === null ? {} : { body: { maxPriceMinor } }),
  });
}
export function reserveListing(id: string, arriveInMinutes: 15 | 30 | 60) {
  return request<{ ok: true; priceMinor: number; expiresAt: string; conversationId: string }>(`/listings/${id}/reserve`, { method: "POST", body: { arriveInMinutes } });
}
export function cancelListingReservation(id: string) {
  return request<{ ok: true }>(`/listings/${id}/reserve/cancel`, { method: "POST" });
}
export function reportListingNoShow(id: string) {
  return request<{ ok: true }>(`/listings/${id}/reserve/no-show`, { method: "POST" });
}
export function completeUrgentListing(id: string, outcome: "sold" | "cancelled") {
  return request<{ ok: true; outcome: string; finalPriceMinor: number | null }>(`/listings/${id}/complete`, { method: "POST", body: { outcome } });
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
