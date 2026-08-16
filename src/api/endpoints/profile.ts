import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { User } from "../types";

export async function getProfile(id: string): Promise<User> {
  return USE_MOCK ? mockApi.userById(id) : request<User>(`/profiles/${id}`);
}

export async function updateProfile(id: string, patch: Partial<User>): Promise<User> {
  if (USE_MOCK) {
    const current = await mockApi.userById(id);
    return { ...current, ...patch };
  }
  return request<User>(`/profiles/${id}`, { method: "PATCH", body: patch });
}
