/**
 * POST /api/support — обращение из публичной страницы «Поддержка».
 *
 * Доступно без авторизации (человек может не иметь аккаунта), поэтому:
 * жёсткий rate limit по IP, строгая валидация и никакого эха введённых данных
 * в ответе. Если человек авторизован — привязываем обращение к аккаунту.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query } from "../db.ts";
import { optionalUserId } from "../auth/middleware.ts";
import { env } from "../env.ts";
import { sendMail } from "../mail/smtp.ts";

const schema = z.object({
  email: z.string().trim().email("Проверьте адрес почты").max(254),
  topic: z.enum(["account", "safety", "verification", "payment", "other"]),
  message: z.string().trim().min(20, "Опишите ситуацию чуть подробнее").max(2000),
});

const topicLabels: Record<z.infer<typeof schema>["topic"], string> = {
  account: "Аккаунт и вход",
  safety: "Безопасность и жалоба",
  verification: "Верификация",
  payment: "Оплата и подписка",
  other: "Другое",
};

export async function supportRoutes(app: FastifyInstance) {
  app.post(
    "/",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request) => {
      const body = schema.parse(request.body);
      const userId = await optionalUserId(request);

      await query(
        "INSERT INTO support_requests (user_id, email, topic, message, ip) VALUES ($1, $2, $3, $4, $5)",
        [userId, body.email, body.topic, body.message, request.ip],
      );

      if (env.SUPPORT_EMAIL) {
        // Ошибка доставки письма не должна ломать приём обращения:
        // запись в базе уже есть, модератор увидит её в любом случае.
        try {
          await sendMail({
            to: env.SUPPORT_EMAIL,
            subject: `Поддержка: ${topicLabels[body.topic]}`,
            text: `От: ${body.email}\nТема: ${topicLabels[body.topic]}\n\n${body.message}`,
          });
        } catch (error) {
          app.log.error({ err: error }, "[support] письмо модератору не ушло");
        }
      }

      return { ok: true as const };
    },
  );
}
