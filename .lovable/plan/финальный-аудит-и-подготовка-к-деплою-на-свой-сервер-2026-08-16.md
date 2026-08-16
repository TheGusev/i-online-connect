# Финальный аудит и подготовка к деплою на свой сервер

## Что уже в порядке (проверено)

- Все данные идут через `src/api/client.ts` (`VITE_API_URL`, `fetch`, `ApiError`, Bearer-токен). Сторонних облачных SDK нет: ни Supabase, ни Firebase, ни аналитики — в `src/` нет ни одного импорта таких пакетов.
- Компоненты обращаются к данным только через `src/api/endpoints/*` (реэкспорт из `src/api/index.ts`).
- Хардкода доменов, портов и ключей нет. Единственные внешние URL — `https://fonts.googleapis.com` / `fonts.gstatic.com` в `src/routes/__root.tsx` (шрифт Manrope), это нормально.
- Серверных функций (`createServerFn`), серверных роутов и loader'ов нет вообще — приложение полностью клиентское, поэтому статическая раздача через Nginx реально возможна.

## Что нужно исправить

### 1. Единый флаг моков и папка `src/api/mocks/`

- Переименовать `src/api/mock/` → `src/api/mocks/` (файлы `index.ts`, `data.ts`, `profiles.ts`, `spaces.ts`), обновить импорты в 8 файлах `src/api/endpoints/*`.
- Переименовать флаг `VITE_USE_MOCK` → `VITE_USE_MOCKS` (в задании указано именно это имя) и убрать неявное правило «пустой `VITE_API_URL` ⇒ моки»: сейчас забытая переменная на проде тихо включит фейковые данные. Новое поведение: моки только при `VITE_USE_MOCKS=true`; при `false` и пустом `VITE_API_URL` — явная ошибка в консоли при старте.
- Изолировать переключение в одном месте: `src/api/mocks/index.ts` остаётся единственной точкой входа моков, а в `endpoints/*` оставить текущий паттерн `USE_MOCKS ? mockApi.x() : request(...)`, чтобы удаление папки моков требовало правки только этих однострочников (перечислю их в DEPLOY.md).

### 2. WebSocket через `VITE_WS_URL`

`useChatSocket` сейчас получает `url` пропом, который нигде не передаётся. Добавить в клиент `export const WS_URL = import.meta.env.VITE_WS_URL ?? ""` и использовать его как значение по умолчанию в хуке (мок-режим остаётся, если переменная пуста).

### 3. Статическая сборка в `dist/`

- Включить SPA-режим TanStack Start в `vite.config.ts` (`spa: { enabled: true }` + prerender корневого шелла), чтобы сборка давала клиентский бандл и `index.html` без серверного рантайма.
- Добавить скрипт `build` → сборка + копирование клиентских артефактов в чистую `dist/` (включая `public/favicon.ico`, `robots.txt`), чтобы `npm run build` выдавал именно `dist/` со статикой, как требует задание.
- Проверить результат: собрать, убедиться, что `dist/index.html` + `dist/assets/*` существуют, и прогнать статику локальным статическим сервером с fallback, открыв `/feed`, `/settings`, `/profile/me` через Playwright (роутинг клиентский, поэтому важен fallback).
- Если TanStack Start не даёт полностью статический выхлоп без Node-рантайма, вернусь с этим фактом и предложу второй вариант (Node-сервер под PM2 + Nginx как reverse proxy) вместо тихого компромисса.

### 4. `.env.example`

`VITE_API_URL`, `VITE_WS_URL`, `VITE_USE_MOCKS`, `VITE_APP_NAME` — с комментариями и значениями для локальной разработки и прода.

### 5. `DEPLOY.md`

Сборка (`npm ci`, `.env.production`, `npm run build`), объяснение что `VITE_*` вшиваются в бандл на этапе сборки; конфиг Nginx с `root /var/www/ya-online/dist`, `try_files $uri $uri/ /index.html`, кэшированием `/assets` (immutable) и `no-cache` для `index.html`; `location /api/` proxy_pass на Node-backend и `location /ws/` с апгрейдом соединения; краткий блок про PM2 для backend'а и про отключение моков.

## Итоговая структура папок

Выведу дерево проекта после рефакторинга отдельным блоком в финальном ответе.

## Технические детали

- Затрагиваемые файлы: `vite.config.ts`, `package.json` (скрипты), `src/api/client.ts`, `src/api/index.ts`, `src/api/mocks/*` (переименование), `src/api/endpoints/*` (импорты), `src/features/chat/useChatSocket.ts`, новые `.env.example`, `DEPLOY.md`.
- Логика экранов, дизайн-система и тексты не меняются.
