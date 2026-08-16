import { useMutation, useQuery } from "@tanstack/react-query";

import { trustApi, type ReportDraft, type VerificationDraft } from "@/api";

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

export function useSubmitVerification() {
  return useMutation({
    mutationFn: (draft: VerificationDraft) => trustApi.submitVerification(draft),
  });
}
