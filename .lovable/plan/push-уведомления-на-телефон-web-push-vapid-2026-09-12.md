# Push-уведомления на телефон (Web Push + VAPID)

Цель: сообщения, новые встречи в пространствах и совпадения приходят уведомлением на телефон, даже когда приложение закрыто. Без сторонних сервисов — только свой сервер.

## Что увидит пользователь

- В «Настройках» новый переключатель «Push-уведомления на устройство». При включении браузер спросит разрешение; после согласия устройство подписывается.
- Уведомление приходит с заголовком и текстом; тап открывает нужный экран (диалог, страницу сообщества).
- На iPhone в Safari, если сайт не добавлен на домашний экран, вместо переключателя появляется подсказка: «Чтобы получать уведомления, добавьте «Я Онлайн» на экран «Домой»: Поделиться → На экран Домой». Это ограничение Apple (нужен iOS 16.4+), а не сбой.
- Переключатель показывается только там, где браузер это поддерживает; если разрешение ранее было отклонено — подсказка, как включить его в настройках браузера.

## Когда приходит пуш

- Новое сообщение в личном чате — если получатель не открыт в этом диалоге (та же проверка, что уже используется для внутренних уведомлений).
- Организатор создал встречу — всем участникам пространства, кроме самого организатора.
- Взаимный лайк (совпадение) — обоим.
- Демо-профили (`is_seed`) в рассылку не попадают, как и сейчас.
- Пуш уходит вместе с существующей записью в списке уведомлений, а не вместо неё. Уважаем текущие переключатели типов уведомлений (`messages`, `spaces`, `matches`).

## Техническая часть

### Сервер

1. Зависимость `web-push` в `server/package.json`.
2. Переменные окружения (в `server/src/env.ts`, `.env.example`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — по умолчанию пустые, при пустых значениях отправка выключается и в лог пишется предупреждение (сервер не падает). Ключи генерирует владелец сервера командой `npx web-push generate-vapid-keys` и вписывает в `.env` на сервере — в чат они не попадают.
3. Миграция `server/migrations/013_push_subscriptions.sql`: `push_subscriptions (id uuid pk, user_id uuid → users on delete cascade, endpoint text unique, p256dh text, auth text, user_agent text, created_at, last_used_at)`, индекс по `user_id`.
4. `server/src/push/send.ts` — хелпер `sendPushToUser(userId, { title, body, url, tag })`: берёт подписки пользователя, шлёт через `web-push`, при статусе 404/410 удаляет подписку, ошибки только логирует (никогда не ломает основной запрос).
5. Новый роут `server/src/routes/push.ts` (регистрация в `server/src/index.ts`, префикс `/push`, `requireAuth`):
   - `GET /push/public-key` — публичный VAPID-ключ (чтобы не пересобирать фронтенд при смене ключа);
   - `POST /push/subscribe` — upsert по `endpoint`;
   - `POST /push/unsubscribe` — удаление по `endpoint`.
   Zod-валидация тела, rate limit как у остальных маршрутов.
6. Вызовы `sendPushToUser` там, где уже пишется `notifications`: `server/src/routes/chat.ts` (новое сообщение), `server/src/routes/spaces.ts` (создание встречи — рассылка участникам), `server/src/routes/matching.ts` (совпадение).

### Фронтенд

1. `public/manifest.webmanifest` — `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `background_color`/`theme_color` `#0B0F1A`, иконки на основе `public/favicon.png`; ссылка на манифест в `src/routes/__root.tsx`. Оба файла попадают в `dist/static` при `npm run build:static`.
2. `public/sw.js` — обработчики `push` (`showNotification` с иконкой и `data.url`) и `notificationclick` (фокус существующей вкладки или открытие URL). Только уведомления, без кеширования оффлайн — чтобы не ломать текущий механизм обновлений `version.json`.
3. Регистрация service worker после гидратации (в `src/routes/__root.tsx`), только в браузере и по https/localhost.
4. `src/api/endpoints/push.ts` — `getPushPublicKey`, `subscribePush`, `unsubscribePush`; экспорт в `src/api/index.ts`.
5. `src/features/notifications/usePushSubscription.ts` — состояние (`unsupported | needs-install | denied | off | on`), включение/выключение, конвертация base64url → Uint8Array.
6. `src/features/settings/components/NotificationsSection.tsx` — блок «На устройство» с этим переключателем и подсказкой для iOS.

### Проверки

- `npx tsgo --noEmit` и `npm run build:static`.
- Playwright 393×626: экран «Настройки» с новым переключателем и вид подсказки для iOS.
- Обновление документации: `API.md` (эндпоинты push), `DATABASE.md` (таблица), `DEPLOY.md`/`SERVER-SETUP.md` (генерация VAPID-ключей, применение миграции 013, раздача `sw.js` и манифеста с корня в Nginx).

## Что остаётся за вами

- Сгенерировать VAPID-ключи и вписать их в `.env` на сервере, применить миграцию 013 и перезапустить backend.
- Проверить фактическое получение уведомления на своём телефоне (в этой среде реальное устройство и запись видео недоступны) — я приложу скриншоты интерфейса.
