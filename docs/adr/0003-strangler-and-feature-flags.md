# ADR-0003 · Strangler-миграция и feature-flags

- **Статус:** Принято
- **Дата:** 2026-06-20

## Решение

- **Strangler:** новая логика живёт за feature-flag рядом со старой; старое удаляется отдельным шагом после стабилизации. Долгоживущих веток нет — незаконченное прячется за флагом. `main` всегда зелёный и деплоится.
- **Мелкие обратимые шаги:** один шаг компилируется, проходит тесты (включая гейт изоляции) и ручной smoke за < 1 дня. Что нельзя откатить одной командой (`git revert`, down-миграция, выключение флага) — переразбивается.
- **Опасные миграции — порядок инвариантен:** для любой колонки, делающей тенант обязательным —
  **`nullable` → `backfill` (org #1) → аудит write-path → флип `NOT NULL`** (Postgres-only, под guard'ом драйвера). Каждый под-шаг — отдельный обратимый merge.

## Feature-flags (env-булевы в `config.go`)

| Флаг | Дефолт | Включает (фаза) |
|---|---|---|
| `TENANT_MIDDLEWARE_ENABLED` | false | резолвинг тенанта (Ф0 no-op → Ф2 поддомен) |
| `TENANT_SCOPING_ENFORCED` | false | GORM request-scope + проверка org_id/conf_id (Ф2) |
| `RLS_ENABLED` | false | политики RLS на стороне БД (Ф2) |
| `BILLING_ENABLED` | false | ЮKassa-подписка (Ф4) |
| `ESIA_LOGIN_ENABLED` | false | вход ЕСИА (Ф4) |
| `campaigns` / `analytics` / `peer_review` / `academic_export` / `custom_domains` | false | эпики Ф5 |
