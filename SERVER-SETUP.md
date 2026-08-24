# Подготовка сервера «Я Онлайн» с нуля

Ubuntu 24.04 LTS (подходит и 22.04). Всё выполняется по SSH.
Замените `example.com` на свой домен, а все пароли — на сгенерированные.

Итог: Nginx с TLS отдаёт статику SPA, Node.js API под PM2 слушает только
loopback, PostgreSQL закрыт от внешней сети, фаервол и fail2ban включены,
бэкапы по расписанию.

> Порядок разделов не случайный: сначала доступ и фаервол, потом сервисы.
> Не открывайте порт базы «на время настройки» — забудете закрыть.

---

## 0. Что нужно заранее

- Сервер: 2 vCPU / 4 ГБ RAM / 40 ГБ SSD — комфортный минимум.
- A-запись домена `example.com` (и `www`) указывает на IP сервера.
- Ваш SSH-ключ (`~/.ssh/id_ed25519.pub` на локальной машине).

---

## 1. Пользователь и SSH

```bash
# от root
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# вставьте свой публичный ключ:
nano /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

Проверьте вход **в отдельном окне**: `ssh deploy@example.com`.
Только после успешного входа закрывайте пароли и root:

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 20
AllowUsers deploy
EOF
sudo sshd -t && sudo systemctl reload ssh
```

Смена порта SSH — по желанию; безопасности почти не добавляет, но убирает
шум в логах. Если меняете, не забудьте открыть новый порт в UFW **до**
перезапуска.

Автоматические обновления безопасности:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 2. Фаервол UFW

```bash
sudo apt -y install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # или ваш порт SSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Порты 4000 (API) и 5432 (PostgreSQL) наружу **не открываем никогда** —
к ним обращается только сам сервер.

---

## 3. fail2ban

```bash
sudo apt -y install fail2ban
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
maxretry = 4
bantime = 24h

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter  = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 30m
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```

---

## 4. Node.js 22 LTS и PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs build-essential
node -v            # ожидаем v22.x
sudo npm i -g pm2
```

---

## 5. PostgreSQL 16

```bash
sudo apt -y install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Проверьте, что база слушает только loopback
(`/etc/postgresql/16/main/postgresql.conf`):

```conf
listen_addresses = 'localhost'
password_encryption = scram-sha-256
```

Аутентификация (`/etc/postgresql/16/main/pg_hba.conf`) — только scram по
локальным подключениям:

```conf
local   all   postgres                     peer
local   all   all                          scram-sha-256
host    all   all   127.0.0.1/32           scram-sha-256
host    all   all   ::1/128                scram-sha-256
```

Создание базы и роли:

```bash
PGPASS=$(openssl rand -base64 32)
echo "Пароль БД (сохраните в .env): $PGPASS"
sudo -u postgres psql <<SQL
CREATE ROLE ya_online LOGIN PASSWORD '${PGPASS}';
CREATE DATABASE ya_online OWNER ya_online ENCODING 'UTF8' TEMPLATE template0;
SQL
sudo -u postgres psql -d ya_online <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ya_online;
SQL
sudo systemctl restart postgresql
```

Немного тюнинга под 4 ГБ RAM (`postgresql.conf`):

```conf
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100
```

> `max_connections` должен быть заметно больше, чем
> `instances × PG_POOL_MAX` из PM2 (по умолчанию 2 × 10 = 20).

---

## 6. Каталоги приложения

```bash
sudo install -d -o deploy -g deploy /var/www/ya-online        # статика SPA
sudo install -d -o deploy -g deploy /var/www/ya-online-api    # backend
sudo install -d -o deploy -g deploy -m 750 /var/lib/ya-online/media
sudo install -d -o deploy -g deploy -m 700 /var/lib/ya-online/verification
sudo install -d -o deploy -g deploy /var/log/ya-online
sudo install -d -o deploy -g deploy -m 700 /var/backups/ya-online
```

Каталог `verification` — режим `700`: селфи не должны быть доступны ни
Nginx, ни другим пользователям системы.

---

## 7. Backend: развёртывание

На локальной машине:

```bash
rsync -az --delete --exclude node_modules --exclude dist \
  server/ deploy@example.com:/var/www/ya-online-api/
```

На сервере:

```bash
cd /var/www/ya-online-api
cp .env.example .env
chmod 600 .env
nano .env      # DATABASE_URL с паролем из шага 5, секреты JWT, CORS_ORIGINS

# секреты JWT — по 48 случайных байт каждый:
openssl rand -base64 48

npm ci --omit=dev && npm install --include=dev typescript @types/node @types/pg
npm run build              # -> dist/
npm run migrate            # создаёт схему БД

pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup                # выполните команду, которую он напечатает
pm2 install pm2-logrotate  # ротация логов
```

Проверка: `curl -s http://127.0.0.1:4000/api/health` → `{"ok":true,...}`.

---

## 8. Фронтенд: сборка и загрузка

На локальной машине:

```bash
cp .env.example .env.production
# VITE_API_URL=/api
# VITE_WS_URL=wss://example.com/ws
# VITE_APP_NAME=Я Онлайн

npm ci
npm run build:static
rsync -az --delete dist/static/ deploy@example.com:/var/www/ya-online/
```

Помните: `VITE_*` вшиваются в бандл при сборке. Поменяли переменную —
пересобирайте.

---

## 9. Nginx и TLS

```bash
sudo apt -y install nginx certbot python3-certbot-nginx
```

`/etc/nginx/conf.d/ya-online-limits.conf`:

```nginx
# Зоны ограничений. Общий лимит на API и жёсткий — на вход.
limit_req_zone $binary_remote_addr zone=api_zone:10m  rate=20r/s;
limit_req_zone $binary_remote_addr zone=auth_zone:10m rate=1r/s;
```

`/etc/nginx/sites-available/ya-online.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    root /var/www/ya-online;
    index index.html;

    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(self)" always;
    # camera/microphone нужны экрану верификации и видео-визитке.
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://example.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    server_tokens off;

    client_max_body_size 8m;   # data URL селфи

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # 1. Ассеты с хешем в имени — кешируем навсегда
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # 2. index.html не кешируем, иначе клиенты залипнут на старой сборке
    location = /index.html {
        add_header Cache-Control "no-store" always;
    }

    # 3. Жёсткий лимит на вход: защита от перебора паролей
    location /api/auth/ {
        limit_req zone=auth_zone burst=5 nodelay;
        proxy_pass http://127.0.0.1:4000;
        include /etc/nginx/proxy-common.conf;
    }

    # 4. Остальное API
    location /api/ {
        limit_req zone=api_zone burst=40 nodelay;
        proxy_pass http://127.0.0.1:4000;
        include /etc/nginx/proxy-common.conf;
    }

    # 5. WebSocket чата
    location /ws/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_set_header X-Real-IP  $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # 6. SPA-роутинг: любой маршрут отдаёт index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Скрытые файлы наружу не отдаём
    location ~ /\. { deny all; }
}
```

`/etc/nginx/proxy-common.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 30s;
proxy_connect_timeout 5s;
```

Включаем и получаем сертификат:

```bash
sudo ln -s /etc/nginx/sites-available/ya-online.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d www.example.com --redirect
sudo systemctl status certbot.timer      # автообновление уже включено
```

Ключевая строка для роутинга — `try_files $uri $uri/ /index.html;`:
без неё обновление страницы на `/feed` или `/profile/me` вернёт 404.

---

## 10. Резервное копирование

`/usr/local/bin/ya-online-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR=/var/backups/ya-online
STAMP=$(date +%F_%H%M)
source /var/www/ya-online-api/.env
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$DIR/db_$STAMP.dump"
tar -czf "$DIR/media_$STAMP.tar.gz" -C /var/lib/ya-online media
# Храним 14 дней
find "$DIR" -type f -mtime +14 -delete
```

```bash
sudo chmod 750 /usr/local/bin/ya-online-backup.sh
sudo chown deploy:deploy /usr/local/bin/ya-online-backup.sh
sudo -u deploy crontab -e
# 30 3 * * * /usr/local/bin/ya-online-backup.sh >> /var/log/ya-online/backup.log 2>&1
```

Копии **обязательно** увозите с сервера (второй хост или объектное
хранилище) и раз в месяц проверяйте восстановление на тестовой базе.

---

## 11. Мониторинг

```bash
pm2 status && pm2 monit
pm2 logs ya-online-api --lines 100
sudo tail -f /var/log/nginx/error.log
curl -s https://example.com/api/health
```

Внешний аптайм-монитор настройте на `https://example.com/api/health`:
он отдаёт `503`, если API поднят, но потерял базу.

---

## 12. Обновление версии

```bash
# фронтенд (локально)
npm ci && npm run build:static
rsync -az --delete dist/static/ deploy@example.com:/var/www/ya-online/

# backend (локально -> сервер)
rsync -az --delete --exclude node_modules --exclude dist --exclude .env \
  server/ deploy@example.com:/var/www/ya-online-api/
ssh deploy@example.com '
  cd /var/www/ya-online-api &&
  npm ci &&
  npm run build &&
  npm run migrate &&
  pm2 reload ya-online-api
'
```

`pm2 reload` перезапускает процессы по одному — запросы не рвутся.
Перезагружать Nginx при обновлении статики не нужно.

---

## 13. Чеклист «сервер готов к приёму»

- [ ] Вход по SSH только по ключу, root-логин закрыт, `sshd -t` проходит
- [ ] UFW включён: открыты только 22, 80, 443
- [ ] fail2ban активен, jail `sshd` в статусе
- [ ] PostgreSQL слушает только localhost, пароль scram, роль без SUPERUSER
- [ ] `npm run migrate` прошёл, таблицы на месте
- [ ] `.env` backend: `chmod 600`, секреты JWT по 48 байт, не из примера
- [ ] `curl http://127.0.0.1:4000/api/health` → `{"ok":true}`
- [ ] PM2: `pm2 save` + `pm2 startup` выполнены (после перезагрузки поднимается)
- [ ] Сертификат Let's Encrypt выдан, `certbot.timer` активен
- [ ] `https://example.com/feed` открывается напрямую (F5 не даёт 404)
- [ ] `VITE_API_URL` в `.env.production` указывает на боевой `/api`
- [ ] Заголовки проверены: `curl -sI https://example.com | grep -i strict`
- [ ] Бэкап отработал хотя бы раз, файл на месте, копия увезена с сервера
- [ ] Каталог `/var/lib/ya-online/verification` в режиме `700`
- [ ] Внешний монитор смотрит на `/api/health`

---

## 14. Если что-то не работает

| Симптом | Где смотреть |
| --- | --- |
| Белый экран, в консоли 404 на `/assets/*` | статика не докопирована, проверьте `rsync` и `root` в Nginx |
| 404 при F5 на `/feed` | нет `try_files … /index.html` |
| Пустые списки в интерфейсе | база пустая или `VITE_API_URL` не тот: `pm2 logs ya-online-api` |
| `502 Bad Gateway` на `/api/` | процесс упал: `pm2 logs ya-online-api` |
| `503` от `/api/health` | API жив, база нет: `systemctl status postgresql` |
| Чат не обновляется в реальном времени | блок `location /ws/` без `Upgrade`, или `VITE_WS_URL` не тот |
| `401` сразу после входа | разошлись секреты JWT (пересобирали `.env` — перезапустите PM2) |
| Камера не включается на `/verification` | нет HTTPS или `Permissions-Policy` запрещает `camera` |
