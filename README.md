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

## Данные по умолчанию

- Админ: `admin@conf.local`
- Пароль: `Admin123!`

## Документы и check-in

- Программа: персональная и полная (`/documents/program?type=personal|full`).
- Бейдж: QR содержит защищенный токен для check-in.
- Сертификат: доступен после check-in участника в админке.
- Сборник трудов: открывается после перевода конференции в статус `finished` и указания ссылки на PDF в админке.

## Технологии

- Frontend: React + Vite
- Backend: Go + Gin + GORM
- DB: Postgres
