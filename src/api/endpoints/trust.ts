import { request, upload } from "../client";
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
  onProgress?: (percent: number) => void,
): Promise<VerificationTicket> {
  const isMp4 = video.type.includes("mp4");
  const form = new FormData();
  form.append("challengeId", challengeId);
  form.append("file", video, isMp4 ? "verification.mp4" : "verification.webm");
  return upload<VerificationTicket>("/trust/verification", form, {
    ...(onProgress ? { onProgress } : {}),
    timeoutMs: 90_000,
    timeoutMessage: "Видео не успело загрузиться. Проверьте связь и попробуйте ещё раз.",
  });
}
