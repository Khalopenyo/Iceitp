# Деплой Кворума (одна VM + Docker Compose + Caddy + RLS)

Топология: одна VM, всё в Docker Compose — `db` (Postgres), `api` (Go), `frontend`
(nginx: SPA + прокси `/api`), `caddy` (TLS + реверс-прокси). `frontend` сам проксирует
`/api` на `api`, сохраняя Host, поэтому Caddy просто терминирует TLS и шлёт всё на
`frontend:80`. Тенант резолвится по поддомену (`вуз.ВАШ_ДОМЕН`).

Замените везде `ВАШ_ДОМЕН` на ваш домен.

---

## 0. Предпосылки
- VM (2 vCPU / 4 ГБ — на старт), установлены Docker + Docker Compose plugin.
- Домен `ВАШ_ДОМЕН`, доступ к DNS.
- (для SMS) аккаунт GreenSMS; (для писем) SMTP-доступ.

## 1. DNS
Две A-записи на IP вашей VM:
```
ВАШ_ДОМЕН.        A   <IP_VM>     ; apex — лендинг платформы
*.ВАШ_ДОМЕН.      A   <IP_VM>     ; все поддомены вузов
```
(`www.ВАШ_ДОМЕН` покрывается отдельной записью или wildcard.)

## 2. Код и окружение
```bash
git clone <repo> && cd ConferencePlatforma
cp deploy/env.production.example .env.production
```
Откройте `.env.production` и заполните:
- `APP_BASE_URL`, `CORS_ORIGINS` — ваш домен;
- `JWT_SECRET` — `openssl rand -hex 32`;
- пароль `conf_app` в `DATABASE_URL` (тот же, что в шаге 4);
- `SMTP_*` и `GREENSMS_*` (можно позже — без них письма/SMS уходят в лог);
- `DNS_API_TOKEN` — токен DNS-провайдера для wildcard-сертификата.

В `deploy/Caddyfile` замените `ВАШ_ДОМЕН` и `<provider>` на ваш DNS-плагин
(см. «TLS» ниже).

## 3. Первый запуск (создаём схему как владелец)
RLS включаем во вторую очередь — сначала поднимаем БД и прогоняем миграции владельцем.
Временно в `.env.production` поставьте `RLS_ENFORCED=false` и
`DATABASE_URL=postgres://conf:confpass@db:5432/confdb?sslmode=disable`, затем:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build db api
docker compose -f docker-compose.prod.yml logs -f api   # дождитесь "server running"
```
Миграции и демо-сид применяются автоматически при старте `api`.

## 4. Провижининг роли приложения (для RLS)
```bash
# поменяйте пароль в deploy/provision_rls_role.sql на тот, что в DATABASE_URL
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U conf -d confdb < deploy/provision_rls_role.sql
```

## 5. Включаем RLS
Верните в `.env.production`:
```
RLS_ENFORCED=true
MIGRATION_DATABASE_URL=postgres://conf:confpass@db:5432/confdb?sslmode=disable
DATABASE_URL=postgres://conf_app:ВАШ_ПАРОЛЬ@db:5432/confdb?sslmode=disable
```
Перезапустите api: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d api`.
Проверьте логи — не должно быть ошибок доступа; `curl -s http://localhost/health` → `{"status":"ok"}`.

## 6. TLS + Caddy (полный стек)
**Wildcard через DNS-01 (рекомендуется).** Базовый `caddy:2` умеет только HTTP-01
(apex), а для `*.ВАШ_ДОМЕН` нужен Caddy с плагином вашего DNS-провайдера. Соберите образ:
```dockerfile
# deploy/Caddy.dockerfile (пример)
FROM caddy:2-builder AS build
RUN xcaddy build --with github.com/caddy-dns/<provider>
FROM caddy:2
COPY --from=build /usr/bin/caddy /usr/bin/caddy
```
и укажите этот образ в `deploy/docker-compose.caddy.yml` (вместо `image: caddy:2`).
Затем поднимите весь стек:
```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml \
  --env-file .env.production up -d --build
```
**Альтернатива без DNS-плагина — on-demand TLS** (сертификат на каждый поддомен по
HTTP-01): замените блок `*.ВАШ_ДОМЕН` в Caddyfile на `on_demand_tls` с `ask`-гейтом
против абьюза. Подробности — в комментариях Caddyfile.

## 7. Первый оператор/админ
```bash
docker compose -f docker-compose.prod.yml exec api \
  /app/server-bootstrap_admin -email you@ВАШ_ДОМЕН -password '<пароль>' -full-name 'Админ'
# (имя бинаря уточните: cmd/bootstrap_admin)
```
Оператора платформы (роль operator) заводят out-of-band (SQL/seed) — UI не создаёт.

## 8. Проверка
- `https://ВАШ_ДОМЕН` → лендинг платформы «Кворум».
- Регистрация вуза → онбординг → консоль → «Опубликовать» → `https://вуз.ВАШ_ДОМЕН`.
- TLS валиден на apex и на поддомене вуза.

---

## Эксплуатация (TODO после запуска)
- **Бэкапы Postgres**: `pg_dump` по cron или managed-БД.
- **Реальная оплата**: сейчас мок (`SelectPlan`) — подключить ЮKassa (платёж+вебхук).
- **S3 для файлов**: при >1 инстанса api заменить локальный `FILE_STORAGE_ROOT`.
- **Мониторинг/ошибки**: Sentry + метрики.
- Сменить дефолтный пароль БД `confpass` на свой (в compose/секретах).
