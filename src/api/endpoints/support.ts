import { request } from "../client";

export type SupportTopic = "account" | "safety" | "verification" | "payment" | "other";

export interface SupportRequestPayload {
  email: string;
  topic: SupportTopic;
  message: string;
}

/** Обращение в поддержку с публичной страницы: работает и без аккаунта. */
export async function sendSupportRequest(payload: SupportRequestPayload): Promise<{ ok: true }> {
  return request<{ ok: true }>("/support", { method: "POST", body: payload });
}
