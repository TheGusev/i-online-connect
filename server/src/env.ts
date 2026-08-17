/**
 * Валидация переменных окружения при старте.
 * Если чего-то не хватает — процесс падает сразу, а не в середине запроса.
 * Секретов в коде нет: всё приходит только из окружения (см. .env.example).
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL обязателен"),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET: минимум 32 символа"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET: минимум 32 символа"),
  ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CORS_ORIGINS: z.string().default(""),

  MEDIA_DIR: z.string().default("/var/lib/ya-online/media"),
  VERIFICATION_DIR: z.string().default("/var/lib/ya-online/verification"),

  ACCOUNT_RESTORE_DAYS: z.coerce.number().int().positive().default(14),
  DAILY_MATCH_LIMIT: z.coerce.number().int().positive().default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("[env] Неверная конфигурация:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
