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

  // ── Вход в админку ─────────────────────────────────────────────────────────
  // Отдельный ключ подписи: обычный access-токен админку не открывает,
  // а админский токен не работает на пользовательских маршрутах.
  // Пусто — вход в админку выключен целиком (безопасное значение по умолчанию).
  JWT_ADMIN_SECRET: z.string().default(""),
  // Короткая сессия без авто-обновления: истекла — только повторный вход.
  ADMIN_SESSION_TTL: z.string().default("2h"),
  // Ключ шифрования секретов TOTP (AES-256-GCM). Минимум 32 символа.
  TOTP_ENCRYPTION_KEY: z.string().default(""),

  // ── Redis: общее хранилище счётчиков rate limit ────────────────────────────
  // Пусто — счётчики живут в памяти процесса (сбрасываются при перезапуске),
  // сервер об этом предупреждает в логе при старте.
  REDIS_HOST: z.string().default(""),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(""),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  // ── Капча (Yandex SmartCaptcha) ───────────────────────────────────────────
  // Пусто — проверка выключена, работают honeypot и лимиты частоты.
  YANDEX_CAPTCHA_SECRET: z.string().default(""),
  YANDEX_CAPTCHA_URL: z
    .string()
    .default("https://smartcaptcha.yandexcloud.net/validate"),

  // Журнал подозрительной активности: все ответы 429 и 403.
  ABUSE_LOG_FILE: z.string().default("logs/abuse.log"),

  CORS_ORIGINS: z.string().default(""),


  MEDIA_DIR: z.string().default("/var/lib/ya-online/media"),
  // Публичный префикс, по которому Nginx раздаёт MEDIA_DIR.
  MEDIA_BASE_URL: z.string().default("/media"),
  VERIFICATION_DIR: z.string().default("/var/lib/ya-online/verification"),

  ACCOUNT_RESTORE_DAYS: z.coerce.number().int().positive().default(14),
  DAILY_MATCH_LIMIT: z.coerce.number().int().positive().default(5),

  // Почта: SMTP собственного сервера. Пусто — письма не уходят, код
  // подтверждения пишется в лог (удобно для локальной разработки).
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  MAIL_FROM: z.string().default("Я Онлайн <noreply@localhost>"),
  // Куда приходят обращения из формы поддержки.
  SUPPORT_EMAIL: z.string().default(""),


  // Автосверка лица на верификации. Без AI_API_KEY заявки уходят в ручную
  // очередь модерации — сервер при этом работает как обычно.
  AI_API_URL: z.string().default("https://ai.gateway.lovable.dev/v1"),
  AI_API_KEY: z.string().default(""),
  AI_VISION_MODEL: z.string().default("openai/gpt-5.6-sol"),
  // Порог уверенности, с которого доверяем автоматическому решению.
  FACE_MATCH_MIN_CONFIDENCE: z.coerce.number().int().min(50).max(100).default(80),
  FFMPEG_PATH: z.string().default("ffmpeg"),

  // Аудит доступа к /api/admin/*: отдельный файл, только метаданные запросов.
  ADMIN_LOG_FILE: z.string().default("logs/admin-audit.log"),
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
