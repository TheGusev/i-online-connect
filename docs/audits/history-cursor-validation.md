# Проверка курсоров истории и галереи

Основа: a2b7d81b3729cc9468aef548b90df942b530ab50.

API: 16 сценариев + родительский тест; 17 pass, 0 fail, 0 skipped.
PostgreSQL 16: отдельный временный кластер через Unix-сокет, синтетические данные.
Миграции выполнены только в тестовом кластере. Боевой .env не использовался.

| Файл | SHA-256 проверенного содержимого |
|---|---|
| server/src/routes/chat.ts | e70d67556c4d15d14c18d183843d7aff13a13f5dfc1603289cfd27eb2de3149d |
| server/src/chat/history-cursor.ts | 68a506fce21383b1a62db4a1309914e7d86a20b5708f4aa6a1f5abd3ccad0032 |
| server/tests/history-cursor.test.mjs | bd00321194d2304e391ad965ab437e83d9375114a620ee6828f69ab3fe41bf7c |
| server/tests/history-pagination.test.mjs | b8bf71ba81c785053558c525e7b6a2fe1d9109915507fbceab9159c5de923a7f |

Локальная ветвь защиты тестового окружения проверена.
CI-ветвь подключения и полный workflow ещё не подтверждены.

SQL-сценарии: границы 0/1/49/50/51/120, равные timestamps,
микросекунды, фильтры галереи, soft-delete, удаление границы,
параллельная вставка, cleared_at, ISO-before и запрет чужого доступа.

Это не browser/PWA-приёмка, не нагрузочный тест и не production-выкладка.
Миграций новой схемы в пакете нет.
