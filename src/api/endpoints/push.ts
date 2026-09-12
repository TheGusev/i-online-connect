import { request } from "../client";

export interface PushKeyResponse {
  enabled: boolean;
  publicKey: string;
}

/** Публичный VAPID-ключ сервера (приватный наружу не отдаётся). */
export async function getPushPublicKey(): Promise<PushKeyResponse> {
  return request<PushKeyResponse>("/push/public-key");
}

/** Сохранить подписку устройства. */
export async function subscribePush(subscription: PushSubscriptionJSON): Promise<{ ok: true }> {
  return request<{ ok: true }>("/push/subscribe", { method: "POST", body: subscription });
}

/** Удалить подписку устройства. */
export async function unsubscribePush(endpoint: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/push/unsubscribe", { method: "POST", body: { endpoint } });
}
