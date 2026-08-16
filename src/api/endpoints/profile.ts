import { USE_MOCKS, request } from "../client";
import { mockApi } from "../mocks";
import type { MyProfile, ProfileDetail, User } from "../types";

export async function getProfile(id: string): Promise<User> {
  return USE_MOCKS ? mockApi.userById(id) : request<User>(`/profiles/${id}`);
}

export async function updateProfile(id: string, patch: Partial<User>): Promise<User> {
  if (USE_MOCKS) {
    const current = await mockApi.userById(id);
    return { ...current, ...patch };
  }
  return request<User>(`/profiles/${id}`, { method: "PATCH", body: patch });
}

export async function getProfileDetail(id: string): Promise<ProfileDetail> {
  return USE_MOCKS ? mockApi.profileDetail(id) : request<ProfileDetail>(`/profiles/${id}/detail`);
}

export async function getMyProfile(): Promise<MyProfile> {
  return USE_MOCKS ? mockApi.myProfile() : request<MyProfile>("/profiles/me");
}

export async function updateMyProfile(patch: Partial<MyProfile>): Promise<MyProfile> {
  return USE_MOCKS
    ? mockApi.updateMyProfile(patch)
    : request<MyProfile>("/profiles/me", { method: "PATCH", body: patch });
}
