# Подготовка сервера: документация + каркас backend

Фронтенд уже полностью готов и не требует изменений: все данные идут через `src/api/client.ts` (`VITE_API_URL`), моки изолированы в `src/api/mocks/` и отключаются флагом `VITE_USE_MOCKS=false`, статика собирается `npm run build:static` в `dist/static`.

Задача: описать, как всё работает, и дать готовый каркас серверной части, чтобы фронтенд можно было переключить с моков на реальный API.

ОС в ответе не указана — все команды пишу под **Ubuntu 24.04 LTS** (подойдут и для 22.04). Если у вас Debian/AlmaLinux, скажите — адаптирую.

## 1. Документация (4 файла)

**ARCHITECTURE.md** — как работает приложение
- Дерево проекта с пояснением каждой папки (`routes`, `features`, `components/ds`, `api`, `store`, `i18n`).
- Схема потока данных: экран → хук в `features/*/hooks.ts` → React Query → `src/api/endpoints/*` → `client.ts` → HTTP/WS на ваш backend.
- Все 17 маршрутов и что каждый делает.
- Дизайн-система: токены в `src/styles.css`, компоненты `src/components/ds`, демо `/design-system`.
- Состояние: React Query (серверные данные) vs Zustand (сессия, онбординг, UI).
- Как убрать моки навсегда.

**API.md** — контракт для backend
Таблица всех ~35 эндпоинтов, которые вызывает фронтенд (из `src/api/endpoints/*`): метод, путь, тело запроса, форма ответа, коды ошибок. Формат ошибки — `{ "message": "..." }` (это то, что читает `ApiError`). Авторизация — `Authorization: Bearer <token>`. Отдельно: протокол WebSocket-чата (типы сообщений, которые ждёт `useChatSocket`).

**DATABASE.md + server/migrations/001_init.sql** — схема PostgreSQL
Полный SQL под текущие типы данных (`src/api/types.ts`): `users`, `profiles`, `profile_media`, `interests`, `user_interests`, `trust_levels`/`verifications`, `matches`, `daily_feed`, `conversations`, `messages`, `meetings`, `spaces`, `space_members`, `space_events`, `event_rsvps`, `space_messages`, `reports`, `blocks`, `settings`, `notification_prefs`, `subscriptions`, `deletion_requests`, `refresh_tokens`. С индексами, `ON DELETE` правилами, enum-типами и ролью `ya_online` с минимальными правами (без SUPERUSER, отдельная роль для миграций).

**SERVER-SETUP.md** — установка и защита сервера
- Базовая подготовка: пользователь `deploy`, SSH только по ключу, отключение root-логина и парольной аутентификации, смена порта (опционально).
- Фаервол UFW: только 22/80/443, Postgres слушает только `127.0.0.1`.
- fail2ban: jail для sshd и nginx.
- Node.js 22 LTS, PostgreSQL 16 (установка, `scram-sha-256`, пароли, создание БД/роли, `pg_hba.conf`).
- Nginx + Certbot (Let's Encrypt, автообновление), security-заголовки (HSTS, CSP, X-Frame-Options, Referrer-Policy), rate limiting для `/api/auth/*`, лимит размера загрузок.
- PM2: `ecosystem.config.cjs`, cluster mode, автозапуск через systemd, ротация логов.
- Бэкапы: `pg_dump` по cron + ротация, проверка восстановления.
- Мониторинг: `pm2 monit`, логи, healthcheck `/api/health`.
- Чеклист «сервер готов к приёму» и деплой-скрипт (сборка → rsync статики → миграции → перезапуск PM2).

## 2. Каркас backend (`server/`)

Отдельная папка в репозитории, деплоится под PM2. Fastify + `pg` + JWT (TypeScript, ESM), запускается отдельно от фронтенда.

```text
server/
├── package.json, tsconfig.json, .env.example
├── ecosystem.config.cjs        # PM2
├── migrations/001_init.sql     # схема БД
├── scripts/migrate.mjs         # прогон миграций
└── src/
    ├── index.ts                # старт, CORS, helmet, rate-limit, /api/health
    ├── db.ts                   # пул соединений
    ├── env.ts                  # валидация переменных через zod
    ├── auth/                   # JWT access+refresh, argon2-хеши, middleware
    ├── ws/chat.ts              # WebSocket-хаб чата
    └── routes/                 # auth, profile, matching, chat, spaces,
                                # onboarding, trust, settings
```

Каждый роут: валидация входа через zod, проверка токена, SQL-запрос-заготовка и TODO там, где нужна бизнес-логика (алгоритм подбора 5 совпадений, AI-подсказки, сверка селфи). Типы ответов повторяют `src/api/types.ts` один-в-один, чтобы фронтенд заработал без правок.

Безопасность в каркасе сразу: argon2 для паролей, refresh-токены в БД с отзывом, rate limit на логин, проверка «пользователь имеет доступ к этому диалогу/сообществу» в каждом запросе, никаких секретов в коде — только `process.env`.

## 3. Что вы делаете после

1. `npm run build:static` → rsync `dist/static` на сервер (уже описано в DEPLOY.md).
2. `server/`: `npm ci && npm run migrate && pm2 start ecosystem.config.cjs`.
3. Во фронтенде `.env.production`: `VITE_USE_MOCKS=false`, `VITE_API_URL=/api`, `VITE_WS_URL=wss://ваш-домен/ws` → пересборка.

## Технические детали

- Новые файлы: `ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `SERVER-SETUP.md`, папка `server/**`.
- Существующий `DEPLOY.md` дополню ссылками на новые документы; код в `src/` не меняется.
- `server/` не попадает в фронтенд-бандл (отдельный `package.json`, исключён из tsconfig фронтенда и из сборки Vite).
