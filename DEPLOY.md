# Деплой «Я Онлайн» на собственный сервер (Nginx + Node.js backend + PostgreSQL)

Фронтенд — чистое SPA. В рантайме **не требуется Node.js**: Nginx раздаёт статику
из `dist/static`, а все данные приходят по HTTP/WebSocket с вашего backend.

Смежные документы:

- [ARCHITECTURE.md](./ARCHITECTURE.md) — как устроен проект и куда что добавлять
- [API.md](./API.md) — контракт эндпоинтов и WebSocket
- [DATABASE.md](./DATABASE.md) — схема PostgreSQL и бэкапы
- [SERVER-SETUP.md](./SERVER-SETUP.md) — установка сервера с нуля: БД, TLS, фаервол, PM2, бэкапы
- [server/README.md](./server/README.md) — каркас backend и что в нём дописать

---

## 1. Переменные окружения

Все переменные с префиксом `VITE_` вшиваются в бандл **на этапе сборки** —
после их изменения нужна пересборка. Секретов в них быть не может: значения видны в браузере.

| Переменная        | Назначение                                       | Пример (прод)         |
| ----------------- | ------------------------------------------------ | --------------------- |
| `VITE_API_URL`    | базовый адрес REST API                           | `/api`                |
| `VITE_WS_URL`     | адрес WebSocket-сервера чата                     | `wss://example.com/ws`|
| `VITE_APP_NAME`   | отображаемое имя приложения                      | `Я Онлайн`            |

Полный список с комментариями — в `.env.example`.

```bash
cp .env.example .env.production
# отредактируйте значения под свой сервер
```

Для локальной разработки в `.env` укажите адрес локального backend:
`VITE_API_URL=http://localhost:4000/api`.

---

## 2. Сборка статики

```bash
npm ci
npm run build:static
```

Результат — `dist/static`:

```
dist/static/
├── index.html        # SPA-шелл, отдаётся на любом маршруте
├── assets/           # js/css/картинки с хешами в именах
├── favicon.ico
└── robots.txt
```

Переменные можно передать и прямо в команду (CI-friendly):

```bash
VITE_API_URL=/api VITE_WS_URL=wss://example.com/ws \
  npm run build:static
```

Vite подхватывает `.env.production` при `--mode production` (режим по умолчанию для сборки).

> `npm run build` — сборка для платформы Lovable (SSR). Для своего сервера всегда
> используйте `npm run build:static`.

Локально проверить результат можно любым статическим сервером с fallback на `index.html`.

---

## 3. Публикация на сервере

```bash
rsync -az --delete dist/static/ deploy@example.com:/var/www/ya-online/
```

Каталог `/var/www/ya-online` — это `root` для Nginx.

---

## 4. Nginx

`/etc/nginx/sites-available/ya-online.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    root /var/www/ya-online;
    index index.html;

    # gzip/brotli для текстовых ассетов
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # 1. Ассеты с хешем в имени — кешируем навсегда
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # 2. SPA-роутинг: любой маршрут отдаёт index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # index.html не кешируем, иначе клиенты залипнут на старой сборке
    location = /index.html {
        add_header Cache-Control "no-store";
    }

    # 3. REST API -> Node.js backend (PM2)
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 4. WebSocket чата
    location /ws {
        proxy_pass http://127.0.0.1:4000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
    }
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ya-online.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Ключевая строка для роутинга — `try_files $uri $uri/ /index.html;`:
без неё обновление страницы на `/feed` или `/profile/me` вернёт 404.

---

## 5. Backend (PM2)

Фронтенд ожидает REST API по `VITE_API_URL` и WebSocket по `VITE_WS_URL`.
Ваш Node.js сервис с PostgreSQL запускается отдельно:

```bash
pm2 start ecosystem.config.cjs   # или: pm2 start dist/index.js --name ya-online-api
pm2 save
pm2 startup
```

Секреты backend (`DATABASE_URL`, JWT-ключи, SMTP) живут только в окружении backend —
во фронтенд они не попадают.

---

## 6. Источник данных

Мок-данных нет: все запросы всегда уходят на `VITE_API_URL`. Если интерфейс
показывает ошибки загрузки — проверяйте backend и прокси `/api`, а не флаги
сборки.

---

## 7. Обновление версии

```bash
git pull
npm ci
npm run build:static
rsync -az --delete dist/static/ deploy@example.com:/var/www/ya-online/
```

Перезапуск Nginx не нужен — раздаётся статика.
