import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { profileApi, type MyProfile } from "@/api";

export function profileQueryOptions(id: string) {
  return {
    queryKey: ["profile", id] as const,
    queryFn: () => profileApi.getProfile(id),
  };
}

export function useProfile(id: string) {
  return useQuery(profileQueryOptions(id));
}

export function profileDetailQueryOptions(id: string) {
  return {
    queryKey: ["profile-detail", id] as const,
    queryFn: () => profileApi.getProfileDetail(id),
  };
}

export function useProfileDetail(id: string) {
  return useQuery(profileDetailQueryOptions(id));
}

export function useMyProfile() {
  return useQuery({ queryKey: ["my-profile"], queryFn: profileApi.getMyProfile });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<MyProfile>) => profileApi.updateMyProfile(patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(["my-profile"], profile);
      queryClient.setQueryData(["profile-detail", "me"], profile);
    },
  });
}
