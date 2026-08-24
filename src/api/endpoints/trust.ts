import { request } from "../client";
import type {
  ReportDraft,
  ReportReceipt,
  TrustSummary,
  VerificationChallenge,
  VerificationTicket,
} from "../types";

export async function getTrustSummary(): Promise<TrustSummary> {
  return request<TrustSummary>("/trust/summary");
}

/** Жалоба на профиль или диалог. Разбирает живая команда модерации. */
export async function submitReport(draft: ReportDraft): Promise<ReportReceipt> {
  return request<ReportReceipt>("/trust/reports", { method: "POST", body: draft });
}

/** Новое одноразовое задание для живого видео: живёт 5 минут. */
export async function getVerificationChallenge(): Promise<VerificationChallenge> {
  return request<VerificationChallenge>("/trust/verification/challenge");
}

/** Статус последней заявки на верификацию. */
export async function getVerificationStatus(): Promise<VerificationTicket> {
  return request<VerificationTicket>("/trust/verification/status");
}

/**
 * Отправка живого видео на сверку с фото профиля.
 * Решение принимает автосверка на сервере; спорные случаи уходят модератору.
 */
export async function submitVerificationVideo(
  challengeId: string,
  video: Blob,
): Promise<VerificationTicket> {
  const form = new FormData();
  form.append("challengeId", challengeId);
  form.append("file", video, "verification.webm");
  return request<VerificationTicket>("/trust/verification", { method: "POST", body: form });
}
