import { request } from "../client";

export interface ConfirmationRequestResult {
  status: "sent" | "verified";
  destination?: string;
  expiresInMinutes?: number;
}

/** Запрос кода подтверждения на почту аккаунта. */
export async function requestEmailCode(): Promise<ConfirmationRequestResult> {
  return request<ConfirmationRequestResult>("/confirm/email/request", { method: "POST" });
}

export async function verifyEmailCode(code: string): Promise<{ status: "verified" }> {
  return request<{ status: "verified" }>("/confirm/email/verify", {
    method: "POST",
    body: { code },
  });
}

/** Запрос кода подтверждения на телефон аккаунта. */
export async function requestPhoneCode(): Promise<ConfirmationRequestResult> {
  return request<ConfirmationRequestResult>("/confirm/phone/request", { method: "POST" });
}

export async function verifyPhoneCode(code: string): Promise<{ status: "verified" }> {
  return request<{ status: "verified" }>("/confirm/phone/verify", {
    method: "POST",
    body: { code },
  });
}
