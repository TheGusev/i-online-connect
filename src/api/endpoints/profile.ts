import { request } from "../client";
import type { MyProfile, ProfileDetail, User } from "../types";

export async function getProfile(id: string): Promise<User> {
  return request<User>(`/profiles/${id}`);
}

export async function updateProfile(id: string, patch: Partial<User>): Promise<User> {
  return request<User>(`/profiles/${id}`, { method: "PATCH", body: patch });
}

export async function getProfileDetail(id: string): Promise<ProfileDetail> {
  return request<ProfileDetail>(`/profiles/${id}/detail`);
}

export async function getMyProfile(): Promise<MyProfile> {
  return request<MyProfile>("/profiles/me");
}

export async function updateMyProfile(patch: Partial<MyProfile>): Promise<MyProfile> {
  return request<MyProfile>("/profiles/me", { method: "PATCH", body: patch });
}
