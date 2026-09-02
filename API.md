# API «Я Онлайн» — контракт

Базовый путь: `VITE_API_URL` (в проде `/api`). Всё в UTF-8 JSON.

- **Авторизация:** `Authorization: Bearer <access token>` на всех эндпоинтах,
  кроме `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`.
- **Ошибки:** всегда `{ "message": "текст для человека" }`.
  Коды: `400` — валидация, `401` — нет/истёк токен, `403` — нет прав,
  `404` — не найдено, `409` — конфликт, `429` — слишком много запросов,
  `500` — внутренняя ошибка.
- **Даты:** строки ISO 8601 в UTC (`2026-08-17T09:12:00.000Z`).
- **Идентификаторы:** UUID v4.
- Формы объектов — `src/api/types.ts` (фронтенд) и `server/src/types.ts` (backend).

---

## Аутентификация

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ email, password, name }` | `Session` = `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` | `Session` |
| POST | `/auth/refresh` | — (refresh в cookie) | `{ token }` |
| POST | `/auth/logout` | — | `204` |
| GET | `/auth/me` | — | `User` |

Refresh-токен ставится в httpOnly-cookie `ya_refresh` (path `/api/auth`,
`Secure`, `SameSite=Lax`) и при каждом обновлении заменяется новым (ротация).
Ответ на неверный логин и на несуществующий email одинаковый — «Неверный email
или пароль». Лимит: 10 попыток входа за 10 минут с одного IP.

---

## Онбординг

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| POST | `/onboarding` | `OnboardingDraft` | `User` |

`OnboardingDraft`: `{ name, age, intent, about, interests[], values{values,joy,dealbreakers}, city, hideExactLocation, photoName, videoName, videoSkipped }`.
Возраст меньше 18 → `400`.

---

## Профили

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/profiles/me` | — | `MyProfile` |
| PATCH | `/profiles/me` | частичный `MyProfile` | `MyProfile` |
| GET | `/profiles/:id` | — | `User` |
| GET | `/profiles/:id/detail` | — | `ProfileDetail` |

`MyProfile` = `ProfileDetail` + `privacy`, `verification`, `stats`.
Чужой профиль не содержит координат и приватной статистики.
Если кто-то из двоих заблокировал другого — `403`.

---

## Подбор

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/matching/daily` | — | `DailyFeed` = `{ matches[], dailyLimit, nextRefreshAt }` |
| GET | `/matching/candidates` | — | `MatchCandidate[]` |
| POST | `/matching/candidates/:id/reaction` | `{ reaction: "like"\|"skip"\|"save" }` | `{ matched: boolean }` |

Подборка фиксируется на сутки: повторный `GET /matching/daily` в тот же день
возвращает тех же людей. `nextRefreshAt` — начало следующих суток UTC.
При взаимном `like` создаётся пара и диалог, `matched: true`.

---

## Чат

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/chat/conversations` | — | `Conversation[]` |
| GET | `/chat/conversations/:id` | — | `Conversation` |
| GET | `/chat/conversations/:id/messages` | — | `Message[]` (до 500, по возрастанию) |
| GET | `/chat/conversations/:id/starters` | — | `string[]` (до 3 подсказок) |
| POST | `/chat/conversations/:id/messages` | `{ text }` | `Message` |
| POST | `/chat/conversations/:id/read` | — | `204` |
| POST | `/chat/conversations/:id/meetings` | `{ kind: "coffee"\|"walk"\|"event", text }` | `Message` c `kind: "meeting"` |

`awaitingReply` в `Conversation` = последнее сообщение написал собеседник.
Не участник диалога получает `403` на любой из этих запросов.

---

## Сообщества (Spaces)

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/spaces` | — | `Space[]` |
| POST | `/spaces` | `SpaceDraft` | `SpaceDetail` |
| GET | `/spaces/:id` | — | `SpaceDetail` |
| POST | `/spaces/:id/join` | `{ answer? }` | `SpaceDetail` |
| POST | `/spaces/:id/leave` | — | `SpaceDetail` |
| POST | `/spaces/:id/events/:eventId/rsvp` | `{ going: boolean }` | `SpaceDetail` |
| GET | `/spaces/:id/messages` | — | `SpaceMessage[]` |
| POST | `/spaces/:id/messages` | `{ text }` | `SpaceMessage` |

`joinPolicy: "question"` требует непустой `answer`, иначе `400`; участник
получает статус `pending` до решения организатора. Групповой чат доступен
только участникам (`403` остальным). Организатор не может выйти из своего
сообщества (`403`) — сначала передача прав.

---

## Доверие и безопасность

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/trust/summary` | — | `TrustSummary` = `{ level, score, checks[] }` |
| POST | `/trust/reports` | `ReportDraft` | `ReportReceipt` |
| GET | `/trust/verification/challenge` | — | `VerificationChallenge` |
| GET | `/trust/verification/status` | — | `VerificationTicket` |
| POST | `/trust/verification` | multipart: `challengeId`, `file` (видео) | `VerificationTicket` |

`blockToo: true` в жалобе сразу блокирует человека.

### Видео-верификация

1. `GET /trust/verification/challenge` — сервер выдаёт одноразовое задание
   (`instructions[]`, `spokenCode`) и главное фото профиля для сверки.
   Задание живёт 5 минут и сгорает после использования, поэтому заранее
   записанное видео не проходит. Без фото в профиле — `400`.
2. `POST /trust/verification` — живое видео (WebM или MP4, до 40 МБ) вместе с
   `challengeId`. Сервер режет кадры через `ffmpeg` и сравнивает их с фото
   профиля моделью зрения.
3. Результат в `status`: `verified` (сверка уверена), `rejected` (уверенно не
   совпало или признаки подделки), `pending` (уверенности мало — смотрит
   модератор). В `reason` — человеческое объяснение.

Лимит: 3 заявки в час. Видео и кадр лежат в приватном каталоге, который Nginx
не раздаёт; в БД попадает только путь, вердикт и уверенность. Если `AI_API_KEY`
не задан, отказов не бывает — все заявки уходят в ручную очередь.

---

## Медиа профиля

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| POST | `/media` | multipart: `file` | `ProfileMedia` |
| DELETE | `/media/:id` | — | `204` |

Тип файла определяется по подписи содержимого, а не по имени: фото —
JPEG/PNG/WebP до 8 МБ, видео — WebM/MP4 до 40 МБ. Файлы попадают в
`MEDIA_DIR/<userId>/` и раздаются Nginx по `MEDIA_BASE_URL`. Первое фото
автоматически становится главным — именно с ним сверяется верификация.
Лимит: 30 загрузок в час.

---

## Настройки

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/settings` | — | `SettingsBundle` |
| PATCH | `/settings/account` | `{ email?, phone?, language? }` | `AccountSettings` |
| PATCH | `/settings/notifications` | частичный `NotificationSettings` | `NotificationSettings` |
| POST | `/settings/password` | `{ current, next }` | `{ ok: true }` |
| DELETE | `/settings/account` | `{ reason?, comment? }` | `DeleteAccountReceipt` |

Смена email сбрасывает `emailVerified`. Смена пароля отзывает все
refresh-токены (выход на других устройствах). Удаление аккаунта — мягкое:
профиль сразу исчезает из подборок, данные можно вернуть в течение
`ACCOUNT_RESTORE_DAYS` дней.

---

## Служебное

| Метод | Путь | Ответ |
| --- | --- | --- |
| GET | `/health` | `200 { ok: true, uptime }` или `503`, если БД недоступна |

Используйте для мониторинга и проверки после деплоя.

---

## WebSocket-чат

Адрес: `VITE_WS_URL` + `/chat/:conversationId?token=<access token>`
(в проде `wss://example.com/ws/chat/<id>?token=…`).

Токен передаётся в query, потому что браузерный WebSocket не умеет ставить
заголовок `Authorization`. Соединение только по `wss`, токен живёт минуты.

Сервер закрывает соединение с кодом:
- `4401` — токена нет или он недействителен;
- `4403` — пользователь не участник диалога.

Кадры от сервера (совпадают с `ChatSocketEvent` на фронтенде):

```json
{ "type": "message", "conversationId": "…", "message": { /* Message */ } }
{ "type": "typing",  "conversationId": "…", "authorId": "…" }
{ "type": "read",    "conversationId": "…", "authorId": "…" }
```

Кадры от клиента: только `{ "type": "typing" }`. Сами сообщения отправляются
по HTTP — так запись в БД и валидация остаются в одном месте.

> Масштабирование: комнаты живут в памяти процесса. При `instances > 1` в PM2
> нужен общий канал (Redis pub/sub или `LISTEN/NOTIFY` в PostgreSQL), иначе
> событие не дойдёт до клиента на другом процессе.

## Совместимость версий (обязательное правило)

Фронтенд у пользователя может быть старее backend: вкладку держат открытой
часами. Поэтому:

1. Изменения DTO — только additive: новые поля добавляются **опциональными**.
2. Удаление/переименование поля — через deprecation: минимум один релиз поле
   отдаётся под старым и новым именем, только потом старое убирается.
3. Новые поля в теле запроса — optional, и без них эндпоинт сохраняет прежнее
   поведение по умолчанию (например `expiresInDays` у `/api/listings`).
4. Каждая сборка кладёт `dist/static/version.json` (`{ version, builtAt }`).
   Открытые вкладки опрашивают его раз в 3 минуты и показывают баннер
   «Вышло обновление» — перезагрузка только по клику пользователя.

## Раздел «Рядом» — объявления (`/api/listings`)

Все методы требуют авторизации. Город наследуется из профиля, доверие автора —
тот же `trustLevel`, фото — id из `/api/media`, отклик открывает обычный диалог
`conversations`, жалобы идут в общий `reports` (`source: "listing"`).

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/listings?city=&category=&q=&limit=&onlyMyNeeds=` | Поиск активных объявлений (по умолчанию — свой город) |
| GET | `/api/listings/mine` | Свои объявления в любом статусе |
| GET | `/api/listings/:id` | Карточка |
| POST | `/api/listings` | `{ category, title, description?, priceMinor?, city?, mediaIds?, expiresInDays? }` |
| PATCH | `/api/listings/:id` | Правка своего: `title?`, `description?`, `priceMinor?`, `state?`, `mediaIds?` |
| POST | `/api/listings/:id/close` | Закрыть |
| POST | `/api/listings/:id/respond` | `{ text? }` → `{ conversationId, created }` |
| GET | `/api/listings/needs` | Свои категории жизненных задач |
| PUT | `/api/listings/needs` | `{ categories: NeedCategory[] }` — заменяет набор |

`NeedCategory`: `sale | service | leisure | travel | help`.

### Анти-спам

Лимиты частоты считаются **по аккаунту** (ключ — `sub` из access-токена), для
запросов без токена — по IP. Общий потолок: 300 запросов в минуту.

| Действие | Лимит |
| --- | --- |
| `POST /api/listings` | 20 в час |
| `POST /api/listings/:id/respond` | 30 в час |
| `PATCH /api/listings/:id` | 60 в час |
| Активных объявлений у автора | не больше 15 одновременно |

При превышении возвращается `429` с русским текстом в поле `message`;
превышение лимита активных объявлений — `400` с подсказкой закрыть старое.

## Уведомления (`/api/notifications`)

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/notifications?unread=&limit=` | `{ unreadCount, items }` |
| POST | `/api/notifications/read` | `{ ids? }`; без `ids` — прочитать все |

Реальное время: `wss://<host>/ws/notifications?token=<access>` →
`{ type: "notification", notification }`. Если пользователь офлайн, запись
остаётся в БД (придёт при следующем заходе) и уходит письмо, если включён
тумблер `notification_prefs.listings`.

## Админка (`/api/admin/*`)

Доступ: заголовок `x-admin-token: <админский токен>` **и** `users.role = 'admin'`.
Обычный access-токен админку не открывает: у неё отдельный ключ подписи
(`JWT_ADMIN_SECRET`) и срок 2 часа без продления. Любой отказ — одинаковый `403`
без подсказок о существовании раздела. Роль выдаётся только на сервере командой
`npm run grant-admin -- admin@example.com` (в `server/`), публичная регистрация
роль не выдаёт никогда.

Вход — единственный открытый маршрут раздела:

| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/api/admin/session` | `{ email, password, totp, captchaToken?, contactFax? }` → `{ token, expiresIn }`. Три фактора: honeypot + SmartCaptcha, пароль (argon2id), одноразовый код TOTP (повтор кода отклоняется). Лимит: 5 попыток / 10 минут на IP. Любая ошибка — `403 «Не удалось войти»`. Все попытки пишутся в `admin_login_attempts` |
| GET | `/api/admin/session` | Кто я: `{ id, email, displayName }`. Панель вызывает при загрузке, чтобы проверить, жив ли токен |

DTO-правило: наружу не уходят `password_hash`, `token_hash`, `totp_secret`, коды
подтверждения и пути к файлам селфи/видео верификации — даже администратору.

| Метод | Путь | Описание |
| --- | --- | --- |

| GET | `/api/admin/users?q=&verified=yes\|no&blocked=yes\|no&page=&limit=` | Список: поиск по email/имени, пагинация (`limit` ≤ 100) |
| GET | `/api/admin/users/:id` | Карточка: профиль, медиа, статус верификации, 20 последних `login_attempts`, счётчики жалоб, число активных сессий |
| POST | `/api/admin/users/:id/block` | `{ reason }` — блокировка + отзыв всех сессий |
| POST | `/api/admin/users/:id/unblock` | Снять блокировку |
| DELETE | `/api/admin/users/:id` | `{ reason? }` — мягкое удаление с окном восстановления |
| GET | `/api/admin/reports?state=` | Очередь жалоб |
| PATCH | `/api/admin/reports/:id` | `{ state, note? }` — решение модератора |
| GET | `/api/admin/verifications?status=pending` | Очередь видео-верификаций |
| PATCH | `/api/admin/verifications/:id` | `{ status: verified\|rejected, note? }` — синхронизирует `video_verified` и уровень доверия |
| GET | `/api/admin/support?status=` | Обращения из формы поддержки |
| PATCH | `/api/admin/support/:id` | `{ status?, reply? }` — ответ уходит письмом через SMTP |
| GET | `/api/admin/listings?state=&q=` | Объявления «Рядом» |
| PATCH | `/api/admin/listings/:id` | `{ state: closed\|active, note? }` — снять с публикации / вернуть |
| GET | `/api/admin/spaces?q=` | Сообщества с числом участников и будущих событий |
| DELETE | `/api/admin/spaces/:id` | `{ reason? }` — удаление |
| GET | `/api/admin/stats?days=30` | Регистрации по дням, активные сессии, матчи/сообщения/объявления за период, размеры очередей |
| GET | `/api/admin/actions` | Журнал действий администраторов |

Списки отвечают в одной форме: `{ items, total, page, limit, hasMore }`.

### Безопасность админки

- Отдельный лимит: 60 запросов в минуту на аккаунт; изменяющие действия —
  30 в час; `DELETE /users/:id` и `DELETE /spaces/:id` — 10 в час.
- Каждое изменяющее действие пишется в таблицу `admin_actions`
  (кто, что, над каким объектом, когда, с какого IP).
- Каждый запрос к `/api/admin/*` пишется строкой JSON в отдельный файл
  `ADMIN_LOG_FILE` (по умолчанию `logs/admin-audit.log`): время, метод, путь,
  статус, `userId`, IP, длительность. Тела запросов и заголовки не логируются.
- Блокировка действует мгновенно: `requireAuth` отдаёт `403` заблокированному
  аккаунту, а его refresh-токены отозваны.
