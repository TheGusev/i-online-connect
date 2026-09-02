/**
 * Отправка писем через SMTP собственного сервера.
 *
 * Настройки берутся из окружения (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASSWORD, MAIL_FROM). Если SMTP_HOST не задан, письмо не отправляется,
 * а его текст уходит в лог — так локальная разработка не требует почтового
 * сервера, а прод падает только на реальной ошибке доставки.
 */
import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../env.ts";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 — неявный TLS, 587 — STARTTLS.
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
  });
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(message: MailMessage): Promise<{ sent: boolean }> {
  const client = getTransporter();
  if (!client) {
    console.warn(
      `[mail] SMTP_HOST не задан — письмо не отправлено. to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
    return { sent: false };
  }

  await client.sendMail({
    from: env.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });
  return { sent: true };
}

/** Письмо с кодом подтверждения адреса. */
export function confirmationEmail(code: string, name: string): Omit<MailMessage, "to"> {
  const greeting = name ? `${name}, привет!` : "Привет!";
  return {
    subject: `Код подтверждения: ${code}`,
    text: `${greeting}\n\nКод для подтверждения почты в «Я Онлайн»: ${code}\nКод действует 15 минут.\n\nЕсли вы не запрашивали код — просто удалите это письмо.`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#2b2b2b">` +
      `<p>${greeting}</p>` +
      `<p>Код для подтверждения почты в «Я Онлайн»:</p>` +
      `<p style="font-size:30px;font-weight:700;letter-spacing:4px;color:#FF6B5B">${code}</p>` +
      `<p style="color:#6b6b6b">Код действует 15 минут. Если вы не запрашивали код — просто удалите это письмо.</p>` +
      `</div>`,
  };
}
