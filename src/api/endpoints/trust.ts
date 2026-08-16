import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { TrustSummary } from "../types";

export async function getTrustSummary(): Promise<TrustSummary> {
  return USE_MOCK ? mockApi.trust() : request<TrustSummary>("/trust/summary");
}
