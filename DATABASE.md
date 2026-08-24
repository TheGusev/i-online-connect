# База данных «Я Онлайн» (PostgreSQL 16)

Схема — `server/migrations/001_init.sql`. Применяется командой:

```bash
cd server && npm run migrate
```

Миграции идут по алфавиту, каждая один раз (журнал — таблица
`schema_migrations`), каждая в своей транзакции: упала — БД осталась целой.
**Существующие миграции не правим** — только новый файл `002_*.sql`.

---

## 1. Создание базы и роли

Приложение работает от роли без права создавать роли и базы. Отдельная роль
для миграций не нужна: DDL выполняет владелец схемы `ya_online`, но
`SUPERUSER` у него нет.

```sql
CREATE ROLE ya_online LOGIN PASSWORD 'СГЕНЕРИРУЙТЕ_ДЛИННЫЙ_ПАРОЛЬ';
CREATE DATABASE ya_online OWNER ya_online ENCODING 'UTF8' LC_COLLATE 'ru_RU.UTF-8' LC_CTYPE 'ru_RU.UTF-8' TEMPLATE template0;

\c ya_online
-- Публичная схема по умолчанию открыта всем — закрываем.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ya_online;
```

Расширения (`pgcrypto` для `gen_random_uuid()`, `citext` для
регистронезависимого email) создаёт сама миграция.

---

## 2. Группы таблиц

### Аккаунты и вход
| Таблица | Назначение |
| --- | --- |
| `users` | email (citext, уникальный), телефон, `password_hash` (argon2id), язык, мягкое удаление `deleted_at`, пауза `paused_at`, `last_seen_at` |
| `refresh_tokens` | только SHA-256 хеш токена, срок, отзыв, IP и user-agent устройства |
| `login_attempts` | журнал попыток входа для анализа и блокировок |

Пароли в открытом виде в БД не попадают никогда. Утечка дампа не даёт войти:
хеши argon2id не обратимы, refresh-токены хранятся хешами.

### Профили
| Таблица | Назначение |
| --- | --- |
| `profiles` | имя, возраст (`CHECK age >= 18`), город, координаты, «о себе», намерение, ответы про ценности, уровень и баллы доверия, счётчики |
| `profile_media` | фото и видео: тип, URL, порядок, «главное» фото |
| `interests`, `user_interests` | справочник интересов и связь с людьми |
| `profile_values` | ценности как отдельные метки для карточки |

Координаты (`lat`, `lon`) наружу не отдаются — выдача зависит от
`privacy_settings.exact_location`.

### Приватность, настройки, подписка
`privacy_settings` (видимость в подборках, кто видит геолокацию, кто может
писать), `notification_prefs` (4 канала), `subscriptions` (тариф, место под
платёжного провайдера), `deletion_requests` (причина + окно восстановления).

### Верификация
`verifications` — статус (`none/pending/verified/rejected`), приватные пути к
видео и контрольному кадру, текст задания, вердикт автосверки (`verdict` JSON,
`confidence`, `reason`), кто и когда проверил вручную.
`verification_challenges` — одноразовые задания для живого видео: инструкции,
произносимый код, срок жизни (5 минут) и отметка об использовании.

### Подбор
| Таблица | Назначение |
| --- | --- |
| `match_reactions` | like / skip / save, уникально на пару, `CHECK user_id <> target_id` |
| `matches` | взаимные симпатии; порядок нормализован (`CHECK user_a < user_b`), поэтому пара не дублируется |
| `daily_feed` | подборка на конкретную дату: 5 кандидатов, совместимость, объяснение AI, подсказка первой фразы, позиция |

`daily_feed` — причина, по которой обновление страницы не подсовывает новых
людей: подборка привязана к `(user_id, feed_date)`.

### Чат
`conversations` (пара + время последнего сообщения),
`conversation_participants` (`last_read_at` — основа непрочитанных,
`archived_at`), `messages` (текст, `kind = text|meeting`),
`meetings` (предложение встречи: тип, заметка, согласие).

### Сообщества
`spaces` (категория, формат, регулярность, город, политика входа и вопрос,
организатор), `space_interests`, `space_members` (`member/pending/host` +
ответ на вопрос), `space_events`, `event_rsvps`, `space_messages`.

### Безопасность
`reports` (категория, источник, состояние `new/in_review/resolved/rejected`,
модератор), `blocks` (действует в обе стороны).

---

## 3. Целостность и удаление

- Почти все связи — `ON DELETE CASCADE` от `users`: удаление аккаунта
  забирает медиа, реакции, сообщения, участие в сообществах.
- `spaces.host_id` — `ON DELETE RESTRICT`: нельзя удалить организатора, не
  передав сообщество. Это осознанная защита от исчезновения живых групп.
- Ссылки на модератора и автора события — `ON DELETE SET NULL`: история
  сохраняется без персональной привязки.
- Приложение делает **мягкое** удаление (`users.deleted_at`), физическое —
  задачей по расписанию после окна восстановления.

---

## 4. Индексы

Созданы под реальные запросы экранов:

| Индекс | Запрос, который он ускоряет |
| --- | --- |
| `daily_feed_lookup_idx (user_id, feed_date, position)` | загрузка `/feed` |
| `messages_conversation_idx (conversation_id, created_at)` | открытие переписки |
| `conversation_participants_user_idx (user_id)` | список диалогов |
| `space_events_upcoming_idx (space_id, starts_at)` | ближайшее событие сообщества |
| `space_messages_feed_idx (space_id, created_at)` | групповой чат |
| `spaces_city_category_idx (city, category)` | табы «Рядом» и «По интересам» |
| `reports_queue_idx (state, created_at)` | очередь модерации |
| `refresh_tokens_user_idx` (частичный, активные) | обновление сессии |

Гео-радиус пока считается приложением. Если понадобится точное расстояние —
установите PostGIS и добавьте `geography(Point, 4326)` с GiST-индексом
отдельной миграцией.

---

## 5. Резервное копирование

Ежедневный дамп с ротацией (подробнее и с cron — в SERVER-SETUP.md):

```bash
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" \
  --file=/var/backups/ya-online/$(date +%F).dump
```

Восстановление:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" 2026-08-17.dump
```

Проверяйте восстановление на тестовой базе раз в месяц: бэкап, который
никогда не разворачивали, — это не бэкап.

---

## 6. Персональные данные

- Селфи верификации и загруженные медиа — на диске, в БД только пути.
  Каталог `VERIFICATION_DIR` Nginx не раздаёт.
- В логи не пишем тела запросов, `Authorization` и cookie (настроено в
  `server/src/index.ts`).
- Данные для удаления по запросу пользователя: `users`, `profiles`,
  `profile_media`, `profile_values`, `user_interests`, `messages`,
  `space_messages`, `verifications` (плюс файлы селфи).
