/**
 * Точка входа API «Я Онлайн».
 *
 * Слушает 127.0.0.1:PORT — наружу ничего не публикует.
 * Всё внешнее движение идёт через Nginx (TLS, заголовки, rate limit).
 *
 * Пути смонтированы с префиксом /api, чтобы Nginx мог проксировать
 * location /api/ без переписывания путей.
 */
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import { healthcheck, pool } from "./db.ts";
import { env } from "./env.ts";
import { registerErrorHandler } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { chatRoutes } from "./routes/chat.ts";
import { matchingRoutes } from "./routes/matching.ts";
import { onboardingRoutes } from "./routes/onboarding.ts";
import { profileRoutes } from "./routes/profile.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { spaceRoutes } from "./routes/spaces.ts";
import { trustRoutes } from "./routes/trust.ts";
import { chatSocketRoutes } from "./ws/chat.ts";

const app = Fastify({
  logger: {
    level: env.isProd ? "info" : "debug",
    // В логи не должны попадать тела запросов: там пароли и селфи.
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
  // Nginx стоит впереди: доверяем X-Forwarded-For, иначе rate limit
  // увидит один IP (сам Nginx) на всех пользователей.
  trustProxy: true,
  bodyLimit: 6 * 1024 * 1024, // 6 МБ: хватает для data URL селфи
});

registerErrorHandler(app);

await app.register(helmet, {
  // API отдаёт только JSON; CSP для статики настраивается в Nginx.
  contentSecurityPolicy: false,
});

await app.register(cors, {
  origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
});

await app.register(cookie, {});

await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  // Отдельные лимиты для входа и верификации заданы в самих роутах.
  keyGenerator: (request) => request.ip,
});

await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

app.get("/api/health", async (_request, reply) => {
  const dbOk = await healthcheck();
  return reply.status(dbOk ? 200 : 503).send({ ok: dbOk, uptime: process.uptime() });
});

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(profileRoutes, { prefix: "/api/profiles" });
await app.register(matchingRoutes, { prefix: "/api/matching" });
await app.register(chatRoutes, { prefix: "/api/chat" });
await app.register(spaceRoutes, { prefix: "/api/spaces" });
await app.register(onboardingRoutes, { prefix: "/api/onboarding" });
await app.register(trustRoutes, { prefix: "/api/trust" });
await app.register(settingsRoutes, { prefix: "/api/settings" });
await app.register(chatSocketRoutes, { prefix: "/ws" });

// Корректное завершение: PM2 присылает SIGINT/SIGTERM при reload.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`Получен ${signal}, закрываю соединения`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`API слушает http://${env.HOST}:${env.PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
