# Срочные сделки — отчёт

## Точечные исправления — 25.10.2026

Изменены `server/src/listings/urgent-jobs.ts`, `server/src/routes/listings.ts`, обе идентичные копии `urgent.ts`, `server/tests/urgent.test.mjs`; добавлен `server/tests/urgent-mutations.test.mjs`. Единственное изменение клиентского отображения — текст «Ваш лот забронирован» для `urgent_reserved` в `src/features/notifications/hooks.ts`. Обновлены этот отчёт, `AGENTS.md` и статус в `roadmap.md`. Миграции 001–031, включая 031, не изменены; библиотек не добавлено.

1. Ручная бронь сохраняет продавцу `urgent_reserved` с `{ listingId, reservationId, expiresAt, priceMinor, source }` в транзакции брони. `deliverUrgent` вызывается только после успешного возврата транзакции, то есть после COMMIT. Для `urgent_reserved` и `urgent_auto_reserved` перед вставкой удаляется прежнее уведомление того же пользователя/вида/лота; `urgent_final_call` и прочие виды по-прежнему защищены от повторов.
2. `shouldCloseExpiredLot` запрещает закрытие истёкшего лота при действующей брони. Задача проверяет её срок и не обрывает такую бронь; следующий проход закроет лот после окончания или отмены. У `POST /:id/complete` нет проверки срока лота: активный лот с действующей бронью допускает `sold`, даже когда его собственный срок истёк. Существующий обработчик не требовал изменения, сценарий проверен тестом.
3. После служебного сообщения `reserveLot` обновляет `conversations.last_message_at = now()` в той же транзакции. Это соответствует обычной отправке в `server/src/routes/chat.ts:568`. `last_read_at` не меняется: обычная отправка также не помечает диалог прочитанным; это делает отдельный `/read` (`chat.ts:756–763`). Покупатель не получает ложный признак прочтения. Формат сообщений сохранён, рассылка событий чата не добавлена.
4. Код PostgreSQL `23505` преобразуется в `409 ALREADY_RESERVED` только при `constraint === 'listing_reservations_one_active'`. Остальные нарушения уникальности пробрасываются без подмены.

### Города

`server/src/env.ts:62` задаёт пустую строку по умолчанию; `env.ts:126` разбивает строку по запятым, убирает пробелы и пустые элементы, приводит названия к нижнему регистру. Проверка создания продажи — `server/src/routes/listings.ts:659`:

```ts
if (env.urgentSellCities.length && !env.urgentSellCities.includes(city.trim().toLocaleLowerCase('ru-RU')))
```

- Пустой `URGENT_SELL_CITIES` (также пробелы/пустые элементы) → ограничение городов отключено, срочная продажа разрешена во всех городах при выполнении остальных правил.
- Непустой список → разрешены только перечисленные города без учёта регистра; другой город получает `403 URGENT_SELL_NOT_AVAILABLE`.

### Проверки исправлений

- **55/55 тестов прошли:** 32 серверных теста чистых правил, 6 серверных тестов операций с подставленными зависимостями, 4 регрессионных теста фото и 13 клиентских тестов срочных сделок.
- Пункт **1 покрыт** тестами точного payload, удаления перед вставкой только для двух разрешённых видов и доставки после коммита; пункт **3 покрыт** проверкой обновления активности диалога без изменения прочтения; пункт **4 покрыт** проверкой нужного индекса и проброса остальных ошибок. Это исполнение исходных функций с подставленным SQL-клиентом, **не проверка PostgreSQL**.
- Пункт **2 покрыт** четырьмя чистыми тестами: без брони/действующая/закончившаяся бронь/неистёкший лот. Дополнительно проверены проход задачи при действующей брони и завершение `sold` после истечения срока лота.
- Обе копии правил совпадают побайтно (`cmp` и тест). Node проверил синтаксис изменённых `urgent-jobs.ts` и `routes/listings.ts`.
- Автоматическая проверка типов клиента и сборка завершились `build OK`; отдельный `tsc` клиента не запускался.
- **tsc сервера не запускался:** `server/node_modules` отсутствует, серверные зависимости не устанавливались. Новые импорты вручную сверены: `insertUrgentNotification` и `deliverUrgent` экспортированы из `urgent-jobs.ts`; `shouldCloseExpiredLot` экспортирована из `urgent.ts`. Сигнатуры вызовов совпадают: PoolClient/userId/kind/payload, массив результатов уведомлений и объект с датами соответственно.
- **На реальной базе не проверено:** SQL/индексы и транзакционный откат, повторные брони в PostgreSQL, конкурентные запросы и фоновые проходы, фактический порядок диалогов/прочтение, доставка WebSocket и полный путь с двумя аккаунтами. Доступного подключения к рабочей базе нет; миграция 031 не применялась. Проверка ограничения городов выполнена по исходному условию, а не созданием лота в рабочей базе.

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