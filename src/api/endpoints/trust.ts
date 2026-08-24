import { request } from "../client";
import type {
  ReportDraft,
  ReportReceipt,
  TrustSummary,
  VerificationDraft,
  VerificationTicket,
} from "../types";

export async function getTrustSummary(): Promise<TrustSummary> {
  return request<TrustSummary>("/trust/summary");
}

/** Жалоба на профиль или диалог. Разбирает живая команда модерации. */
export async function submitReport(draft: ReportDraft): Promise<ReportReceipt> {
  return request<ReportReceipt>("/trust/reports", { method: "POST", body: draft });
}

/** Отправка live-селфи на сверку с фото профиля. Реальная проверка — на backend. */
export async function submitVerification(draft: VerificationDraft): Promise<VerificationTicket> {
  return request<VerificationTicket>("/trust/verification", { method: "POST", body: draft });
}
