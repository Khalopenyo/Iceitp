# ConferencePlatforma

‑платформа для научных конференций: регистрация, личный кабинет, расписание, чат, обратная связь, документы.

## Docker Compose

1. Создать `.env` на основе `.env.example`.
2. Проверить, что в `.env` задан `JWT_SECRET`.
3. Поднять весь стек:
   ```bash
   docker compose up -d --build
   ```
4. Открыть приложение:
   - frontend: `http://localhost`
   - api: `http://localhost:8080`
   - db: `localhost:5434`

Отдельный `worker` для Антиплагиата поднимается автоматически как отдельный сервис.

## Deploy On VPS By IP

Ниже минимальный production-вариант без домена и без HTTPS. Пока домена нет, приложение будет открываться по `http://SERVER_IP`, а ссылки восстановления пароля тоже будут вести на IP.

### 1. Подготовить сервер

Нужен Linux `x86_64`. Текущий backend Docker build собирает бинарники под `linux/amd64`.

```bash
uname -m
```

Ожидаемо: `x86_64` или `amd64`.

Установить Docker, Compose plugin, Git и firewall:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw --force enable
```

### 2. Залить код на сервер

```bash
git clone YOUR_REPO_URL conferenceplatforma
cd conferenceplatforma
```

Если репозиторий уже на сервере, просто перейти в каталог проекта.

### 3. Подготовить production env

```bash
cp .env.production.example .env.production
```

Отредактировать `.env.production`:

- `APP_BASE_URL=http://SERVER_IP`
- `CORS_ORIGINS=http://SERVER_IP`
- `JWT_SECRET=` длинный случайный секрет
- `ACCESS_TOKEN_TTL=12h`
- `SMTP_*` заполнить, если хотите реальные письма для восстановления пароля

Быстро сгенерировать `JWT_SECRET` можно так:

```bash
openssl rand -base64 48
```

### 4. Поднять production стек

Использовать именно production compose, а не обычный development compose:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

### 5. Проверить, что все сервисы живы

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl http://127.0.0.1/api/conference
curl http://127.0.0.1/
```

Снаружи приложение должно открываться по:

```text
http://SERVER_IP
```

### 6. Логи и обслуживание

Проверить логи:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

Обновить проект после нового git push:

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Остановить:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

### 7. Что важно позже

- Пока нет домена, HTTPS нормально не поднимем.
- После появления домена лучше перевести `APP_BASE_URL` и `CORS_ORIGINS` на `https://your-domain`.
- В production сейчас наружу публикуется только frontend на `80`; `api` и `db` остаются внутри docker-сети.

## Локальная разработка

1. Поднять только Postgres:
   ```bash
   docker compose up -d db
   ```
2. Запустить backend:
   ```bash
   npm run api
   ```
3. Запустить worker:
   ```bash
   npm run worker
   ```
4. Запустить frontend:
   ```bash
   npm --prefix frontend install
   npm run dev
   ```

## Первый админ

Автоматического дефолтного админа больше нет. Первый админ создается отдельной командой:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api \
  bootstrap-admin -email admin@example.com -password 'StrongPassword123!'
```

## Документы и check-in

- Программа: персональная и полная (`/documents/program?type=personal|full`).
- Бейдж: QR содержит защищенный токен для check-in.
- Сертификат: доступен после check-in участника в админке.
- Сборник трудов: открывается после перевода конференции в статус `finished` и указания ссылки на PDF в админке.

## Технологии

- Frontend: React + Vite
- Backend: Go + Gin + GORM
- DB: Postgres
