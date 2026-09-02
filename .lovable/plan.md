# Админ-панель: backend (роли, /api/admin/*, аудит)

Первый проход — только серверная часть. Фронтенд `/admin` делаем отдельным промтом.

## 1. Роли и блокировка

Миграция `006_admin.sql`:

- enum `user_role` ('user', 'admin'), колонка `users.role user_role NOT NULL DEFAULT 'user'`.
- `users.blocked_at timestamptz`, `users.blocked_reason text` — блокировка аккаунта админом (отдельно от пользовательской таблицы `blocks`, которая про «скрыть друг от друга»).
- Таблица `admin_actions`: `id`, `admin_id`, `action` (текст, напр. `user.block`), `target_type` ('user'|'report'|'verification'|'support'|'listing'|'space'), `target_id`, `note`, `ip`, `created_at` + индексы по `created_at DESC` и `(target_type, target_id)`.
- Индекс по `users.role`.

Первый администратор не создаётся публичной регистрацией: скрипт `server/scripts/grant-admin.mjs` (`npm run grant-admin -- admin@example.com`) выставляет `role='admin'` существующему пользователю и печатает результат. Если email в базе нет — понятная ошибка. Email вы называете при запуске скрипта, в код он не попадает.

Блокировка: `blocked_at` + отзыв всех `refresh_tokens` пользователя. `requireAuth` начинает возвращать 403 «Аккаунт заблокирован» — то есть заблокированный человек мгновенно теряет доступ, а не после истечения токена.

## 2. Middleware requireAdmin

`server/src/auth/admin.ts`: выполняет `requireAuth`, затем читает `users.role`; не 'admin' → 403 без подсказок о существовании раздела. Повешен как `onRequest` на весь плагин `/api/admin`. Плюс хук аудита: каждый запрос к `/api/admin/*` пишется в отдельный лог-файл (`ADMIN_LOG_FILE`, по умолчанию `logs/admin-audit.log`) строками JSON: время, метод, путь, статус, `user_id`, IP, длительность. Тела запросов не логируются.

## 3. Эндпоинты `/api/admin/*`

Все ответы — DTO-камелкейс без `password_hash`, `token_hash`, путей к видео/селфи и прочих секретов.

| Метод | Путь | Что делает |
| --- | --- | --- |
| GET | `/users?q=&verified=&blocked=&page=&limit=` | пагинация (limit ≤ 100), поиск по email/имени, фильтры |
| GET | `/users/:id` | профиль, медиа, статус верификации, последние 20 `login_attempts`, счётчики жалоб |
| POST | `/users/:id/block` \| `/unblock` | блок с причиной + отзыв сессий |
| DELETE | `/users/:id` | мягкое удаление (`deleted_at`), как в пользовательском сценарии |
| GET | `/reports?state=` | очередь жалоб |
| PATCH | `/reports/:id` | `state`, решение, `moderator_id`, `resolved_at` |
| GET | `/verifications?status=pending` | очередь ручной проверки (`manual`/низкая `confidence`) |
| PATCH | `/verifications/:id` | verified/rejected + синхронизация `profiles.video_verified`, `trust_level` |
| GET | `/support?status=` | обращения |
| PATCH | `/support/:id` | статус и ответ — письмо заявителю через существующий `mail/smtp.ts` |
| GET | `/listings?state=&q=` | объявления «Рядом» |
| PATCH | `/listings/:id` | снять с публикации (`state`) |
| GET | `/spaces` | список пространств с числом участников |
| DELETE | `/spaces/:id` | удаление |
| GET | `/stats` | регистрации по дням за 30 дней, активные сессии (непросроченные refresh-токены), матчи/сообщения/объявления за период |

Каждое изменяющее действие пишет запись в `admin_actions` в той же транзакции.

## 4. Безопасность

- Отдельный, более строгий rate limit на плагине `/api/admin`: 60 запросов/мин по аккаунту; на изменяющие маршруты — 30/час, на `DELETE /users/:id` и `DELETE /spaces/:id` — 10/час. Ответ 429 с русским сообщением, как в остальном API.
- Валидация всех входных данных Zod, id — `uuid`.
- Никаких «скрытых путей» и TOTP в этом проходе; при необходимости добавим отдельно.

## 5. Проверка

Тестовый прогон через Fastify `inject` на локальной базе: обычный пользователь получает 403 на всех `/api/admin/*`; админ — 200; блокировка приводит к 403 на обычных маршрутах; в `admin_actions` появляются записи; в аудит-лог пишутся строки. Обновляю `API.md` и `DATABASE.md`.
