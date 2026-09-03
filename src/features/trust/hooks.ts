import { useMutation, useQuery } from "@tanstack/react-query";

import { trustApi, type ReportDraft } from "@/api";

export const trustQueryOptions = {
  queryKey: ["trust", "summary"] as const,
  queryFn: () => trustApi.getTrustSummary(),
};

export function useTrustSummary() {
  return useQuery(trustQueryOptions);
}

export function useSubmitReport() {
  return useMutation({
    mutationFn: (draft: ReportDraft) => trustApi.submitReport(draft),
  });
}

/** Задание запрашиваем вручную: оно одноразовое и живёт 5 минут. */
export function useVerificationChallenge() {
  return useMutation({
    mutationFn: () => trustApi.getVerificationChallenge(),
  });
}

export const verificationStatusQueryOptions = {
  queryKey: ["trust", "verification", "status"] as const,
  queryFn: () => trustApi.getVerificationStatus(),
};

export function useVerificationStatus() {
  return useQuery({
    ...verificationStatusQueryOptions,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 5_000 : false,
  });
}

export function useSubmitVerificationVideo() {
  return useMutation({
    mutationFn: (input: {
      challengeId: string;
      video: Blob;
      onProgress?: (percent: number) => void;
    }) => trustApi.submitVerificationVideo(input.challengeId, input.video, input.onProgress),
  });
}
