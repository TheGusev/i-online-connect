import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { ReportDraft, ReportReceipt, TrustSummary, VerificationDraft, VerificationTicket } from "../types";

export async function getTrustSummary(): Promise<TrustSummary> {
  return USE_MOCK ? mockApi.trust() : request<TrustSummary>("/trust/summary");
}

/** Жалоба на профиль или диалог. Разбирает живая команда модерации. */
export async function submitReport(draft: ReportDraft): Promise<ReportReceipt> {
  return USE_MOCK
    ? mockApi.submitReport(draft)
    : request<ReportReceipt>("/trust/reports", { method: "POST", body: draft });
}

/** Отправка live-селфи на сверку с фото профиля. Реальная проверка — на backend. */
export async function submitVerification(draft: VerificationDraft): Promise<VerificationTicket> {
  return USE_MOCK
    ? mockApi.submitVerification(draft)
    : request<VerificationTicket>("/trust/verification", { method: "POST", body: draft });
}
