/**
 * Отправка SMS через сменный драйвер. Код не привязан к конкретному провайдеру:
 * «log» — только метаданные без номера и кода, «http» — внешний провайдер.
 */
import type { FastifyBaseLogger } from "fastify";

import { env } from "../env.ts";

export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 2)}***${phone.slice(-4)}` : "***";
}

function logProvider(log: FastifyBaseLogger): SmsProvider {
  return {
    async send() {
      if (env.isProd) {
        log.error("[sms] драйвер log в production: SMS не отправлена");
        return;
      }
      log.info("[sms:log] отправка отключена, содержимое скрыто");
    },
  };
}

function httpProvider(log: FastifyBaseLogger): SmsProvider {
  return {
    async send(phone, text) {
      if (!env.SMS_API_URL || !env.SMS_API_KEY) throw new Error("SMS-провайдер не настроен");
      const response = await fetch(env.SMS_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.SMS_API_KEY}` },
        body: JSON.stringify({ to: phone, text, sender: env.SMS_SENDER || undefined }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        log.warn({ status: response.status }, "[sms] провайдер отклонил отправку");
        throw new Error("Не удалось отправить SMS");
      }
    },
  };
}

export function getSmsProvider(log: FastifyBaseLogger): SmsProvider {
  return env.SMS_PROVIDER === "http" ? httpProvider(log) : logProvider(log);
}

/** Текст в один латинский сегмент (≤160 GSM-7) с доменной строкой для автоподстановки. */
export function otpText(code: string): string {
  const head = `Ya Online code: ${code}`;
  return env.SMS_ORIGIN_DOMAIN ? `${head}\n\n@${env.SMS_ORIGIN_DOMAIN} #${code}` : head;
}
