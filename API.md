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
| POST | `/trust/verification` | `{ selfie, referencePhotoUrl }` | `VerificationTicket` |

`selfie` — data URL (`data:image/jpeg;base64,…`), максимум ~5 МБ.
Лимит: 3 заявки в час. Файл сохраняется в приватный каталог, который Nginx
не раздаёт; в БД попадает только путь. `blockToo: true` в жалобе сразу
блокирует человека.

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
