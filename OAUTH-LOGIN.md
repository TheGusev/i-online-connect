# Яндекс ID и Telegram

## Реализовано

- Существующий Fastify/PostgreSQL API, телефон и почта сохранены. Новых библиотек нет.
- Authorization Code + PKCE S256, random state и nonce. State/verifier в подписанной HttpOnly SameSite=Lax cookie на 10 минут; в production Secure. Одноразовость state проверяется атомарно в существующей auth_otps с отдельным namespace/purpose, в том числе между процессами PM2. Данные OAuth не входят в суточный SMS-лимит.
- Яндекс: https://oauth.yandex.ru/authorize, https://oauth.yandex.ru/token, GET https://login.yandex.ru/info?format=json с Authorization: OAuth. Права login:info, login:email, login:default_phone. Identity — id.
- Telegram: https://oauth.telegram.org/auth, https://oauth.telegram.org/token, Basic client_id:client_secret и code_verifier. Scope openid profile phone. JWKS https://oauth.telegram.org/.well-known/jwks.json кэшируется на 5 минут с ограничением частоты обновления. RS256 проверяется node:crypto; iss, aud, azp для множественных aud, exp, iat/nbf и nonce проверяются до чтения данных. Identity — **sub**, не id.
- Аккаунты не объединяются по email/телефону. Email провайдера не сохраняется, не подтверждается и не используется для поиска; аватар не сохраняется/не загружается. Имя сохраняется, новый аккаунт перенаправляется на существующий онбординг, где его можно изменить. Шаг создания аккаунта для уже вошедшего пользователя заменён продолжением.
- Telegram phone_number без плюса получает +; доверяем только phone_number_verified=true, после normalizePhone/ALLOWED_PHONE_PREFIXES и проверки подтверждённого владельца. Занятый номер не присваивается и не приводит к слиянию. Уже подтверждённый собственный номер не заменяется автоматически при входе/привязке.
- **Яндекс default_phone не содержит документированного признака подтверждения**: не считаем присутствие номера доказательством владения, подтверждение остаётся через существующий SMS-путь. Официальные поля default_phone — id и number.
- Заблокированные/удалённые аккаунты не входят; привязать занятую identity нельзя (409); последний способ входа нельзя отвязать (409) под транзакционной блокировкой. Подтверждённый телефон или email+пароль считаются отдельным доступным способом входа.
- Все start/callback/link/result маршруты ограничены 20 запросами за 10 минут. Ошибки показываются по-русски, в журнале только тип ошибки/провайдер, без ответов провайдеров. Стандартные журналы Fastify удаляют query callback и скрывают Authorization/Cookie/Set-Cookie.
- Access/refresh не помещаются в URL. Callback устанавливает обычную refresh-cookie и короткую подписанную HttpOnly result-cookie; публичная /oauth-callback однократно получает тот же access-токен, читает /auth/me и восстанавливает сессию. В URL только некреденциальные state/provider, state удаляется после успеха.
- Кнопки на входе, телефонном/почтовом экране и шаге регистрации; блок «Способы входа» в настройках, подтверждение отвязки. Кнопки минимум 44px, стиль сохранён. Выключенные провайдеры не показывают кнопки входа/привязки.

## Миграция 034

`server/migrations/034_oauth_identities.sql` расширяет CHECK до phone/telegram/apple/yandex/google, не меняет существующие identity/данные. Google разрешён в CHECK по заданию, вход Google не добавлялся.

После уточнения пользователь **разрешил аккаунты без почты и телефона**: 034 также снимает users_login_method_chk. Подставные адреса не используются. Это согласованное изменение сверх первоначального ограничения «менять только provider CHECK». Создание supporting rows/identity происходит одной транзакцией; запрет последней отвязки остаётся на API.

## Маршруты

- GET /api/auth/yandex/start и /callback
- GET /api/auth/telegram/start и /callback
- POST /api/auth/identities/:provider/link/start — авторизация, возвращает { url }, callback тот же
- DELETE /api/auth/identities/:provider — авторизация, 204 или 409
- GET /api/auth/identities — авторизация, статусы без provider_user_id/контактов
- POST /api/auth/oauth/result — одноразовое получение access-токена по подписанной cookie и state
- GET /api/auth/config — passwordResetEnabled и providers.yandex/telegram, никаких ключей
- /oauth-callback — публичный экран возврата; после входа /chat либо /onboarding, после привязки /settings

## Настройка собственного сервера

В server/.env: YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET (по умолчанию пустые) и PUBLIC_BASE_URL (по умолчанию https://xn--41a.site). Ключи никогда не VITE_. В корневом .env.example только комментарий об их серверном назначении.

Зарегистрировать точные callback URL:

- https://xn--41a.site/api/auth/yandex/callback
- https://xn--41a.site/api/auth/telegram/callback

При другом PUBLIC_BASE_URL использовать его origin в обоих URL. В Яндекс ID включить перечисленные права, в BotFather настроить Login/OIDC, разрешённые redirect URL, алгоритм RS256 и phone/profile. Пары ключей пустые — провайдер выключен.

Применить `npm run migrate` в server/, обновить API/клиент. В Nginx access_log callback не должен сохранять query: использовать $uri вместо $request_uri для этих путей, иначе код/state может попасть в журналы прокси независимо от фильтрации приложения. Публичный адрес сайта и API должен совпадать с зарегистрированным origin для cookie.

## Проверено / ограничения

- 32/32 теста: новые oauth-security/oauth-account и прежние auth-security/phone-auth. Проверены PKCE по RFC-вектору, подпись/срок/state/replay, Telegram неверные подпись/aud/iss/nonce/exp, no-email-merge, аккаунт без контактов, запрет последней отвязки, права привязки, блокировка аккаунтов, подтверждение разрешённого свободного телефона и отказ для занятого/непроверенного/чужого префикса.
- На отдельной PostgreSQL sandbox применены все 34 миграции и пройдены настоящие транзакционные API-тесты. **Рабочая БД владельца и применение 034 там не проверены.**
- Браузер: 1280px и 320px, кнопки минимум 44px; вход Яндекс → onboarding с именем; вход/привязка Telegram с подписанным RS256 ответом и PKCE → статус из API настроек; отвязка Яндекса с подтверждением → обновлённый статус. Это изолированный настоящий API/БД с тестовыми HTTP-ответами провайдеров, не реальные аккаунты Яндекса/Telegram.
- Серверные типы проверены `bunx --package @typescript/native-preview tsgo -p server/tsconfig.json --noEmit`, ошибок нет; **tsc и сборка сервера не запускались**. Автоматическая сборка приложения — build OK.
- **Не проверены:** настоящая авторизация/разрешения у Яндекса и Telegram, рабочие ключи и callback URL, рабочий Nginx. Для включения нужны ключи владельца и применение миграции на его сервере.

Официальные источники: https://yandex.ru/dev/id/doc/en/codes/code-url, https://yandex.ru/dev/id/doc/en/user-information, https://core.telegram.org/bots/telegram-login. У Telegram нет отдельного userinfo endpoint в текущей документации; данные читаются только из проверенного ID token.