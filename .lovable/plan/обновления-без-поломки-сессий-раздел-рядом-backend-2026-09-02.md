# Обновления без поломки сессий + раздел «Рядом» (backend)

Две задачи. Первая — небольшая, фронт + скрипт сборки. Вторая — только backend (фронтенд отдельным промтом).

## Задача 1. Мягкое обновление открытых вкладок

1. `scripts/build-static.mjs` дополнительно пишет `dist/static/version.json`:
   `{ "version": "<git rev-parse --short HEAD>", "builtAt": "<ISO timestamp>" }`.
   Если git недоступен (сборка из архива) — версия = timestamp сборки. Файл создаётся
   после копирования артефактов, поэтому в `dist/static` остаются и `index.html`, и
   `yandex_70fe9142dbc736a8.html`.
2. Nginx-заметка в `DEPLOY.md`: `/version.json` раздавать с `Cache-Control: no-store`.
3. Новый хук `src/hooks/useAppVersion.ts`: при первом успешном ответе запоминает версию
   в памяти (ref), далее `setInterval` 3 минуты + проверка при возврате во вкладку;
   запрос идёт только при `document.visibilityState === "visible"`,
   `fetch("/version.json", { cache: "no-store" })`. Ошибки/404 игнорируются молча.
4. Новый компонент `src/components/UpdateBanner.tsx` — неблокирующий баннер снизу
   («Вышло обновление» + кнопка «Обновить» + «Позже»), в токенах дизайн-системы,
   поверх нижней навигации, с safe-area отступом. Клик по «Обновить» — `location.reload()`.
   Автоматической перезагрузки нет, текущий ввод не прерывается.
5. Монтируется один раз в `src/routes/__root.tsx` рядом с `<Toaster />`.

### Совместимость контрактов API (документируется, не код)

В `API.md` добавляется раздел «Версионирование и совместимость»: изменения DTO только
additive (новые поля — опциональные), удаление/переименование поля — через deprecation
(минимум один релиз поле отдаётся под двумя именами), новые поля в телах запросов —
опциональные с сохранением прежнего поведения по умолчанию. Правило фиксируется и в
`AGENTS.md`, чтобы соблюдалось в будущих правках.

## Задача 2. Backend раздела «Рядом» (объявления)

Логика знакомств (matching, daily_feed), онбординг, чат и верификация не изменяются —
новая ветка подключается параллельно и переиспользует город, доверие, чат, медиа.

### Миграция `server/migrations/005_listings.sql`

- Enum `need_category`: `sale`, `service`, `leisure`, `travel`, `help`.
- Enum `listing_state`: `active`, `closed`, `expired`.
- `user_needs (user_id, category)` — PK по паре, отдельно от `interests` (хобби).
- `listings`: `id`, `author_id → users`, `category need_category`, `city text`
  (снимок из профиля на момент публикации), `title`, `description`, `price_minor int NULL`,
  `currency text DEFAULT 'RUB'`, `state listing_state DEFAULT 'active'`,
  `expires_at timestamptz`, `created_at`, `updated_at`.
  Индексы: `(city, category, state, created_at DESC)`, `(author_id, created_at DESC)`.
- `listing_media (listing_id, media_id → profile_media, position)` — фото берутся из
  существующего `/api/media`, отдельного хранилища нет.
- `listing_responses (listing_id, user_id, conversation_id, created_at)` — уникальная пара
  автор+откликнувшийся, ссылка на существующий диалог.
- `notifications`: `id`, `user_id`, `kind text` (первое значение `listing_match`),
  `payload jsonb`, `read_at`, `created_at`; индекс `(user_id, created_at DESC)`.
- `notification_prefs` получает additive-колонку `listings boolean NOT NULL DEFAULT true`.
- `report_source` расширяется значением `listing`, чтобы жалобы шли в ту же очередь
  `reports` (без отдельной модерации).

### Эндпоинты `/api/listings` (Fastify, `server/src/routes/listings.ts`)

- `GET /` — поиск: `city` (по умолчанию город профиля), `category`, `q`, курсорная
  пагинация; только `state = 'active'` и не истёкшие; исключаются авторы из `blocks`.
  Отдаёт автора с `trustLevel` тем же расчётом, что в профилях/лентe — единый TrustBadge.
- `GET /:id` — карточка с медиа и автором.
- `POST /` — создание (Zod-валидация, лимит на количество активных объявлений и
  rate limit), город наследуется из профиля; после коммита запускается подбор.
- `PATCH /:id` — правка своих полей и статуса (`closed`).
- `DELETE /:id` — мягкое закрытие своего объявления.
- `POST /:id/respond` — отклик: находит или создаёт `conversation` +
  `conversation_participants` через существующий чат-код, пишет первое системное
  сообщение со ссылкой на объявление, возвращает `conversationId`.
- `GET /me` — мои объявления.
- `GET /needs` / `PUT /needs` — чтение и замена набора категорий `user_needs`
  (используется настройками и онбордингом позже, из фронта).
- `GET /api/notifications`, `POST /api/notifications/:id/read`,
  `POST /api/notifications/read-all` — новый роут `server/src/routes/notifications.ts`
  для in-app списка (колокольчик уже есть в UI).

### Подбор и доставка уведомлений

`server/src/listings/matching.ts`: по факту создания объявления выбирает пользователей
того же города, у кого категория есть в `user_needs`, кто не заблокирован автором и у кого
`notification_prefs.listings = true`; исключает автора. Для каждого — строка в
`notifications` с превью (заголовок, категория, цена, первое фото, автор + уровень доверия).
Доставка в реальном времени: WS-хаб чата расширяется пользовательским каналом
`ws/user/:id` (та же авторизация по короткоживущему токену в query, тот же реестр комнат) —
если пользователь онлайн, событие `{ type: "notification", notification }` уходит сразу;
если нет, письмо через существующий `server/src/mail` (по прежним настройкам уведомлений),
а при следующем заходе список подтянется из `notifications`.

### Лендинг (единственная фронт-правка в этой задаче)

В `src/routes/index.tsx` — один компактный блок в существующем ритме страницы с примерами
(«Продать телефон», «Найти компанию в кино», «Срочно нужна помощь с переездом») и ссылкой
на будущий раздел. Отдельной посадочной страницы нет, фокус на знакомствах сохраняется.

### Документация

`DATABASE.md` — новые таблицы и enum; `API.md` — эндпоинты объявлений/needs/уведомлений
и правила совместимости; `ARCHITECTURE.md` — как «Рядом» переиспользует чат, медиа,
доверие и WS.

## Технические детали

- Клиентские API-обёртки (`src/api/endpoints/listings.ts`, типы) добавляются вместе с
  backend, чтобы фронт-промт опирался на готовый типизированный слой; UI-раздел
  «Рядом» (навигация, страницы, формы) — следующий промт.
- Фото объявления не дублируют хранилище: `listing_media` ссылается на `profile_media`,
  загруженный через `/api/media`, с проверкой владения файлом.
- Уведомления идемпотентны: уникальный индекс по (`user_id`, `kind`, `payload->>'listingId'`)
  предотвращает дубли при повторной публикации/ретрае.
