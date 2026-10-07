# Устойчивая сессия: без внезапных выходов при смене сети

Внешний вид не меняется, кроме экрана «Нет связи, пробуем снова» при восстановлении сессии.

## Сервер
- Миграция `024_refresh_grace.sql`: `ALTER TABLE refresh_tokens ADD COLUMN rotated_at timestamptz NULL`.
- `rotateRefreshToken(token, meta)` в `server/src/auth/tokens.ts`: токен принимается, если хеш совпадает, `expires_at > now()`, `revoked_at IS NULL` и (`rotated_at IS NULL` или `rotated_at > now() - interval '60 seconds'`). При ротации — `UPDATE ... SET rotated_at = now() WHERE id=$1 AND rotated_at IS NULL`; `revoked_at` не трогаем. Новый токен выпускается с `userAgent`/`ip`.
- Выход и отзыв всех токенов по-прежнему ставят `revoked_at` — такие токены не принимаются даже в льготный период.
- `server/src/routes/auth.ts`: передать `user-agent` и `request.ip` в `rotateRefreshToken`.

## Клиент (`src/api/client.ts`)
- `refreshAccessToken()` возвращает `{ kind: "ok", token } | { kind: "invalid" } | { kind: "temporary" }`: 401/403 → invalid; сеть, таймаут 10 с (AbortController), 5xx, 429 → temporary.
- Общий promise «текущее обновление»: параллельные вызовы ждут один результат; после завершения сбрасывается.
- `request` и `upload`: запоминаем токен при отправке; при 401 — если текущий токен уже другой, просто повторяем с ним; иначе ждём общего обновления. `invalid` → `setToken(null)` + событие «сессия завершена» (store вызывает `clearSession`); `temporary` → `ApiError(0, "Нет связи с сервером — попробуйте ещё раз")`, токен сохраняется.
- Экспорт `ensureFreshToken()`: читает `exp` из JWT, если до истечения < 60 с — вызывает общее обновление.

## Восстановление сессии (`src/features/auth/session.tsx`)
- При ошибке `getCurrentUser`: если сессия признана недействительной (401 после неудачного обновления) — сброс; при сетевой ошибке — новый статус `offline` в `useSessionStore`, экран «Нет связи, пробуем снова» с кнопкой повтора; авто-повтор по `online` и `visibilitychange → visible`.
- `RequireSession` и `/auth` показывают этот экран вместо редиректа.

## Возврат в приложение
- В `SessionRestore` слушатели `visibilitychange`/`online`: `ensureFreshToken()` → `queryClient.refetchQueries({ type: "active" })` → событие `ya-online:resume`.
- `useChatSocket`, сокет уведомлений и `useLiveRoom`: по `ya-online:resume` переподключаются, если сокет закрыт.

## 4 параллельных запроса после долгого фона
Все четыре получают 401 с одним и тем же старым токеном; первый запускает обновление, остальные видят активный promise и ждут его. Уходит ровно один `/auth/refresh`; после успеха все четыре повторяются с новым токеном. Если access истёк заранее, `ensureFreshToken` при возврате обновит его до запросов — тоже одним вызовом.

## Отчёт
Изменённые файлы, имя миграции `024_refresh_grace.sql`, отличия от задания.
