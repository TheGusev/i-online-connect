/**
 * Yandex SmartCaptcha + honeypot — защита публичных форм от ботов.
 *
 * Почему SmartCaptcha, а не Cloudflare Turnstile: скрипт Cloudflare у части
 * российских провайдеров не загружается, и форма регистрации становится
 * непроходимой. SmartCaptcha работает из РФ стабильно.
 *
 * Пока YANDEX_CAPTCHA_SECRET пуст, проверка выключена: работают honeypot и
 * лимиты частоты. Появятся ключи — достаточно внести их в .env, код не меняем.
 */
import type { FastifyBaseLogger } from "fastify";

import { badRequest } from "../http.ts";
import { env } from "../env.ts";

/**
 * Honeypot: скрытое поле, которое человек не видит и не заполняет.
 * Если оно пришло заполненным — это бот. Ошибку НЕ показываем: ответ
 * выглядит как успешный, но ничего не сохраняется. Бот не понимает,
 * что его отсекли, и не подстраивается.
 */
export function isBotTrapped(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const value = (body as Record<string, unknown>)["contactFax"];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Серверная проверка токена капчи. Токен одноразовый: проверяет Яндекс.
 * Сетевая ошибка на стороне капчи не должна закрывать регистрацию совсем,
 * поэтому при недоступности сервиса пропускаем запрос и пишем в лог —
 * лимиты частоты и honeypot продолжают работать.
 */
export async function assertCaptcha(
  token: string | undefined,
  ip: string,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!env.captchaEnabled) return;
  if (!token) throw badRequest("Подтвердите, что вы не робот");

  const url = new URL(env.YANDEX_CAPTCHA_URL);
  url.searchParams.set("secret", env.YANDEX_CAPTCHA_SECRET);
  url.searchParams.set("token", token);
  url.searchParams.set("ip", ip);

  let ok: boolean;
  try {
    const response = await fetch(url, { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { status?: string };
    ok = data.status === "ok";
  } catch (error) {
    log.error({ err: error }, "[captcha] сервис недоступен — пропускаю проверку");
    return;
  }

  if (!ok) throw badRequest("Проверка не пройдена, попробуйте ещё раз");
}
