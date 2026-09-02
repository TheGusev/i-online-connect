# «Я Онлайн» — архитектура проекта

Документ отвечает на вопрос «как это всё работает». Установка сервера —
в [SERVER-SETUP.md](./SERVER-SETUP.md), контракт API — в [API.md](./API.md),
схема БД — в [DATABASE.md](./DATABASE.md), публикация — в [DEPLOY.md](./DEPLOY.md).

---

## 1. Из чего состоит система

```text
┌──────────────┐   HTTPS /api    ┌──────────────┐   SQL    ┌──────────────┐
│  Браузер     │ ──────────────► │  Node.js API │ ───────► │  PostgreSQL  │
│  SPA (React) │   WSS  /ws      │  (Fastify)   │          │              │
└──────────────┘ ◄────────────── └──────────────┘          └──────────────┘
        ▲                               ▲
        │ статика                       │ PM2 (2 процесса)
        └────────────  Nginx  ──────────┘
                    TLS, заголовки, кеш
```

- **Фронтенд** — статический SPA. В рантайме Node.js не нужен: Nginx отдаёт
  файлы из `dist/static`, роутинг клиентский.
- **Backend** — отдельное приложение в папке `server/`, слушает `127.0.0.1:4000`,
  наружу не публикуется. Nginx проксирует на него `/api/` и `/ws`.
- **База** — PostgreSQL на том же сервере, слушает только loopback.

Никаких внешних облаков: ни Supabase, ни Firebase, ни сторонней аналитики.
Все данные — только через ваш API.

---

## 2. Структура репозитория

```text
├── ARCHITECTURE.md          # этот файл
├── API.md                   # контракт эндпоинтов и WebSocket
├── DATABASE.md              # схема PostgreSQL
├── DEPLOY.md                # сборка и публикация фронтенда
├── SERVER-SETUP.md          # установка и защита сервера
├── .env.example             # переменные фронтенда
│
├── vite.config.ts           # сборка для платформы Lovable (SSR)
├── vite.config.static.ts    # сборка статики для своего сервера
├── scripts/build-static.mjs # подготовка dist/static
│
├── public/                  # favicon, robots.txt
├── src/                     # ФРОНТЕНД
│   ├── routes/              # страницы (файловый роутинг TanStack Router)
│   ├── components/
│   │   ├── ds/              # дизайн-система: Button, Card, Chip, Modal…
│   │   ├── layout/          # AppShell, TopBar, BottomNav, SideNav
│   │   └── landing/         # Reveal — анимация появления блоков
│   ├── features/            # экраны по доменам: hooks + свои компоненты
│   │   ├── auth/  matching/  chat/  spaces/  profile/
│   │   ├── onboarding/  settings/  trust/
│   ├── api/                 # ЕДИНСТВЕННАЯ точка доступа к данным
│   │   ├── client.ts        # fetch, токен, ошибки, чтение VITE_*
│   │   ├── types.ts         # модели данных (DTO)
│   │   ├── endpoints/       # по одному файлу на домен
│   ├── store/               # Zustand: сессия, черновик онбординга, UI
│   ├── i18n/                # RU/EN, initI18n() вызывается в router.tsx
│   ├── styles.css           # ВСЕ токены дизайна (цвета, тени, радиусы)
│   └── router.tsx           # создание роутера и QueryClient
│
└── server/                  # BACKEND (отдельное приложение)
    ├── migrations/001_init.sql
    ├── scripts/migrate.mjs
    ├── ecosystem.config.cjs # PM2
    └── src/
        ├── index.ts         # старт, helmet, CORS, rate limit, /api/health
        ├── env.ts db.ts http.ts types.ts
        ├── auth/            # JWT, argon2, проверки доступа
        ├── ws/chat.ts       # WebSocket-хаб чата
        └── routes/          # auth profile matching chat spaces
                             # onboarding trust settings
```

---

## 3. Поток данных на фронтенде

```text
Экран (src/routes/feed.tsx)
   └── хук домена (src/features/matching/hooks.ts)
         └── React Query (кеш, повторы, инвалидация)
               └── src/api/endpoints/matching.ts
                     └── src/api/client.ts  ──►  VITE_API_URL + Bearer-токен
```

Правила, на которых держится проект:

1. **Ни один компонент не вызывает `fetch` напрямую.** Только через
   `src/api/endpoints/*`. Так адрес API, токен и обработка ошибок живут
   в одном месте.
2. **Серверные данные — в React Query, локальные — в Zustand.** Дублировать
   серверные данные в Zustand нельзя: рассинхронизируется.
3. **Цвета только токенами** из `src/styles.css`. Хардкод вида `text-white`
   или `bg-[#fff]` ломает темизацию.

### Аутентификация на клиенте

`client.ts` хранит access-токен в `localStorage` под ключом `ya-online.token`
и добавляет его как `Authorization: Bearer …` в каждый запрос.
Refresh-токен лежит в httpOnly-cookie и из JavaScript недоступен — так утечка
через XSS не даёт постоянного доступа.

### Ошибки

Backend всегда отвечает `{ "message": "текст для человека" }`.
`client.ts` превращает это в `ApiError { status, message }`, а экраны
показывают текст в тосте (sonner).

---

## 4. Страницы

| Маршрут | Файл | Что делает |
| --- | --- | --- |
| `/` | `routes/index.tsx` | Публичный лендинг: hero, «почему не как везде», как это работает, доверие, футер |
| `/onboarding` | `routes/onboarding.tsx` | Создание профиля диалогом: имя, 18+, намерения, о себе, медиа, интересы, ценности, город |
| `/feed` | `routes/feed.tsx` | «Твои 5 совпадений»: карточки с бейджем доверия и объяснением совпадения |
| `/profile/me` | `routes/profile.me.tsx` | Свой профиль: инлайн-правка, приватность, верификация, статистика |
| `/profile/$id` | `routes/profile.$id.tsx` | Чужой профиль: медиа, намерение, ценности, расшифровка доверия |
| `/chat` | `routes/chat.index.tsx` | Список диалогов + фильтр «ждут ответа» |
| `/chat/$id` | `routes/chat.$id.tsx` | Переписка, подсказки первой фразы, предложение встречи, меню безопасности |
| `/spaces` | `routes/spaces.index.tsx` | Сообщества: рядом / по интересам / мои, создание |
| `/spaces/$id` | `routes/spaces.$id.tsx` | Сообщество: участники, события, групповой чат |
| `/verification` | `routes/verification.tsx` | Live-селфи и сверка с фото профиля |
| `/safety-center` | `routes/safety-center.tsx` | Гайды: первая встреча, красные флаги, уровни доверия |
| `/settings` | `routes/settings.tsx` | Аккаунт, приватность, уведомления, подписка, удаление |
| `/design-system` | `routes/design-system.tsx` | Витрина компонентов (можно удалить перед продом) |

Общая обвязка (`AppShell`, навигация, тосты) — в `routes/__root.tsx`.

---

## 5. Дизайн-система

- Токены (цвета, тени, радиусы, типографика) — только в `src/styles.css`.
- Компоненты — `src/components/ds`: `Button`, `Card`, `Chip`, `Field`,
  `Modal`, `Avatar`, `Toggle`, `TrustBadge`, `Skeleton`.
- Направление: тепло + технологичность + безопасность. Коралловый акцент,
  графит для текста, тёплый почти белый фон; зелёный = доверие,
  янтарный = внимание. Шрифт Manrope подключается `<link>` в `__root.tsx`.
- `TrustBadge` — сквозной элемент: три уровня с тултипом-расшифровкой.

---

## 6. Источник данных

Мок-данных в проекте нет: каждый эндпоинт ходит в реальный API по
`VITE_API_URL`. Без запущенного backend интерфейс покажет ошибку загрузки —
это намеренно, чтобы фейковые люди никогда не попали в прод.

```ts
export async function getDailyFeed(): Promise<DailyFeed> {
  return request<DailyFeed>("/matching/daily");
}
```

---

## 7. Переменные окружения

Фронтенд (вшиваются в бандл при сборке, секретов быть не может):
`VITE_API_URL`, `VITE_WS_URL`, `VITE_APP_NAME` — см. `.env.example`.

Backend (только на сервере, `chmod 600`): `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `CORS_ORIGINS` и другие — см. `server/.env.example`.

---

## 8. Как добавить новую функциональность

1. Модель данных — в `src/api/types.ts` и, зеркально, в `server/src/types.ts`.
2. Таблицы — новой миграцией `server/migrations/00X_*.sql` (старые не правим).
3. Эндпоинт — в `server/src/routes/*` c `requireAuth` и валидацией zod.
4. Клиентский вызов — в `src/api/endpoints/*`.
5. Хук домена в `src/features/*/hooks.ts`, экран в `src/routes/*`.
6. Документацию — в `API.md` и `DATABASE.md`.

## Второй столп продукта: «Рядом»

Знакомства и бытовые задачи используют одни примитивы, а не две параллельные
подсистемы:

```text
город (profiles.city) ─┐
доверие (trust_level) ─┼─► знакомства: matching → daily_feed → conversations
медиа (profile_media) ─┤
чат (conversations)   ─┼─► «Рядом»: user_needs → listings → notifications → conversations
жалобы (reports)      ─┘
```

Подбор при публикации объявления: тот же город + совпадение категории в
`user_needs` + включённый тумблер уведомлений + отсутствие блокировок.
Доставка — WebSocket `/ws/notifications`, если человек онлайн, иначе запись в
`notifications` плюс письмо.

## Обновление фронтенда без поломки сессий

`scripts/build-static.mjs` пишет `dist/static/version.json` (git-хэш или
timestamp; можно задать `APP_VERSION`). `useAppVersion` в `__root.tsx`
опрашивает файл раз в 3 минуты только при видимой вкладке и показывает
`UpdateBanner`. Перезагрузка — исключительно по клику пользователя, чтобы не
терять недописанное сообщение или заполненную форму.
