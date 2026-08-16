import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { MyProfile, ProfileDetail, User } from "../types";

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

export async function getProfileDetail(id: string): Promise<ProfileDetail> {
  return USE_MOCK ? mockApi.profileDetail(id) : request<ProfileDetail>(`/profiles/${id}/detail`);
}

export async function getMyProfile(): Promise<MyProfile> {
  return USE_MOCK ? mockApi.myProfile() : request<MyProfile>("/profiles/me");
}

export async function updateMyProfile(patch: Partial<MyProfile>): Promise<MyProfile> {
  return USE_MOCK
    ? mockApi.updateMyProfile(patch)
    : request<MyProfile>("/profiles/me", { method: "PATCH", body: patch });
}
