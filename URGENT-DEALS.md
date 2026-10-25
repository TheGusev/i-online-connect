# Срочные сделки — отчёт

## Изменённые файлы

- `server/migrations/031_urgent_deals.sql` — поля listings, reservations, bids, watchers, events, проверки и индексы.
- `server/src/listings/urgent.ts` — чистые правила цены, сроков, подсказок, нормализации, неявок и выбора ставки.
- `src/features/nearby/urgent.ts` — точная копия правил.
- `server/tests/urgent.test.mjs`, `src/features/nearby/urgent.test.ts` — тесты.
- `server/src/listings/urgent-jobs.ts` — общие операции брони, истечение, автоматический выбор, уведомления, фоновые задачи.
- `server/src/routes/listings.ts` — создание, DTO, наблюдение, ставки, бронь, неявки и завершение.
- `server/src/listings/notify.ts` — без писем для urgent; пропуск новых срочных с остатком менее 10 минут.
- `server/src/env.ts`, `server/.env.example` — `URGENT_SELL_CITIES`.
- `server/src/index.ts` — задача каждые 15 секунд, снятие таймера при остановке.
- `AGENTS.md`, `roadmap.md`, этот отчёт — правила и статус проверки.

Клиентские экраны, вход, эфир, голосовые, link-preview и миграции 001–030 не менялись. Новых библиотек нет.

## DTO и ответы

Существующие поля объявления сохранены. Добавлены:

```text
urgentType, startPriceMinor, currentPriceMinor,
nextDropAt, lastDropAt, discountFromStartPct, floorHintPct,
watchersCount, iWatch,
myBid: { maxPriceMinor } | null,
reservation: { active, mine, expiresAt, priceMinor, source },
outcome, finalPriceMinor, closedAt
```

Автор дополнительно получает `priceFloorMinor`, `marketPriceMinor`, `bidsCount`, `highestBidMinor`, `activeReservation: { id, buyerName, expiresAt, priceMinor, source } | null`. Другим пользователям и гостям точные минимум/рынок и имя покупателя не выдаются. Даты — ISO, цены — минорные единицы.

- POST/DELETE `/:id/watch`, DELETE `/:id/bid`, cancel/no-show → `{ ok: true }`.
- PUT `/:id/bid` → `{ ok: true, myBid: { maxPriceMinor } }`.
- POST `/:id/reserve` → `{ ok: true, reservationId, expiresAt, priceMinor, source, conversationId }`.
- POST `/:id/complete` → `{ ok: true, outcome, finalPriceMinor }`.
- Ошибки в существующем формате `{ message, error }`, где `error` — код причины, если задан.

Создание срочного объявления и привязка его фотографий выполняются в одной транзакции. Ручная бронь и фоновые действия блокируют строку объявления; уникальный индекс дополнительно защищает от двух активных броней. Фоновая задача защищена от параллельного запуска в процессе и между процессами PostgreSQL advisory lock. Уведомления сохраняются до WebSocket-отправки; финальное напоминание не дублируется благодаря существующему индексу notifications.

## Простые варианты для неоднозначностей

- У buy/giveaway default 360 мин; у help/ride — 60 мин (в задании default указан только для sell).
- Для промежуточной цены от 100 000 ₽ округление до 10 ₽, ниже — до 1 ₽; старт и конечный минимум сохраняются точно.
- Новая ставка должна быть строго ниже текущей цены; если цена уже достигнута, возвращается `BID_ABOVE_CURRENT` с предложением обычной брони.
- `sold` требует активной брони; без неё завершение продажи отклоняется, чтобы не придумывать итоговую цену.
- В существующем message_kind нет system, поэтому служебная фраза брони сохраняется как текст от автора объявления; связь с бронью зафиксирована в listing_events. Формат чатов не менялся.
- GRANT в миграции выдаётся CURRENT_USER — это существующий собственный PostgreSQL, не публичный Data API. Миграции нужно запускать ролью приложения, как и предыдущие. RLS/несуществующие роли anon/authenticated не добавлялись.

## Проверки

- 28 новых серверных тестов urgent и 4 регрессионных теста фото — прошли.
- 17 клиентских тестов (3 urgent и 14 регрессионных) — прошли.
- Node проверил синтаксис `urgent-jobs.ts`, `routes/listings.ts`, `index.ts` без ошибок; это **не** проверка типов.
- Последний автоматический журнал сборки приложения: `build OK`.
- **Сборка и tsc сервера не проверены:** установленных зависимостей server/node_modules нет; новые пакеты не устанавливались.
- **Реальная БД и полный путь создание → бронь → завершение не проверены:** доступного DATABASE_URL нет. Не проверены SQL на рабочем PostgreSQL, гонки реальных запросов, WebSocket-доставка, отработка задач после перезапуска. Миграция 031 не применена.

## Ручная сверка импортов

В изменённых серверных файлах каждый локальный импорт сопоставлен с экспортом исходника:

- listings.ts: query/queryOne/transaction (db); HttpError/badRequest/forbidden/notFound (http); checkListingPhotos (photos); currentUserId/requireAuth (middleware); notifyListingMatches (notify); MAX_LISTING_PHOTOS/MAX_PHOTO_BYTES/assertSize/detectMediaType/saveListingFile/removeListingFile (media/store, включая re-export MAX_LISTING_PHOTOS); publishUserEvent (ws/notifications); datingAccess (completeness-rules, re-export completeness)/loadCompleteness; resolveDuration; env; все перечисленные urgent и urgent-jobs символы.
- urgent-jobs.ts: query/transaction; publishUserEvent; AUTO_HOLD/priceAt/STEPS/pickAutoBidWinner/reservationBan. PoolClient — существующий тип pg, тот же импорт используется в db.ts; FastifyInstance/Zod — существующие зависимости и API проекта.
- notify.ts: query, sendMail, isUserOnline, publishUserEvent.
- index.ts: runUrgentJobs; runSeedRefresh; rateLimitSubject; registerAbuseLog; closeRedis/getRedis; healthcheck/pool/query; env; registerErrorHandler; все register-функции routes и ws сопоставлены с исходными экспортами. Внешние Fastify плагины, Fastify, node-cron и Node mkdir/path уже использовались; их установленный runtime в песочнице не проверен.
- env.ts: z — существующий импорт zod. urgent.ts — импортов нет. Тесты используют стандартные node:assert/strict, node:fs, node:test и экспортируемые функции urgent.ts.

Для применения: в каталоге server выполнить существующий `npm run migrate` (после 001–030), собрать сервер в его установленном окружении и перезапустить процесс. Затем проверить продажу двумя аккаунтами с подтверждёнными телефонами.