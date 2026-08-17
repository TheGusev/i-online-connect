/**
 * Единый формат ошибок API.
 *
 * Фронтенд (src/api/client.ts) читает поле `message` из тела ответа,
 * поэтому все ошибки отдаём как { "message": "..." } с нужным HTTP-кодом.
 */
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";


export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export const badRequest = (message = "Некорректный запрос") => new HttpError(400, message);
export const unauthorized = (message = "Требуется вход") => new HttpError(401, message);
export const forbidden = (message = "Нет доступа") => new HttpError(403, message);
export const notFound = (message = "Не найдено") => new HttpError(404, message);
export const conflict = (message = "Конфликт данных") => new HttpError(409, message);

/** Обработчик ошибок: наружу не утекают стектрейсы и детали БД. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    // Ошибки валидации Fastify/zod.
    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({ message: "Проверьте заполненные поля" });
    }

    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) {
      return reply.status(status).send({ message: (error as Error).message });
    }

    request.log.error({ err: error }, "Необработанная ошибка");
    return reply.status(500).send({ message: "Внутренняя ошибка сервера" });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ message: "Не найдено" });
  });
}
