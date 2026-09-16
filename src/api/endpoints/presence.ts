import { request } from "../client";

export interface PresenceSummary {
  city: number;
  cityName: string | null;
  total: number;
}

export async function getPresenceSummary(): Promise<PresenceSummary> {
  return request<PresenceSummary>("/presence/summary");
}
