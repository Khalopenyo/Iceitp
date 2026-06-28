-- Провижининг роли приложения для RLS (RLS_ENFORCED=true).
--
-- Архитектура двух ролей:
--   conf      — ВЛАДЕЛЕЦ таблиц. Прогоняет миграции/сид (MIGRATION_DATABASE_URL).
--               Как владелец таблиц обходит RLS (политики НЕ forced).
--   conf_app  — НЕ-владелец, под которым приложение обслуживает запросы (DATABASE_URL).
--               Подчиняется fail-closed RLS-политикам (видит только свой тенант).
--
-- Запускать ОДИН раз как conf, ПОСЛЕ первого прогона миграций (чтобы таблицы уже
-- существовали). Поменяйте пароль ниже и подставьте его в DATABASE_URL.

CREATE ROLE conf_app LOGIN PASSWORD 'CHANGE_ME_APP_PASSWORD';

GRANT CONNECT ON DATABASE confdb TO conf_app;
GRANT USAGE ON SCHEMA public TO conf_app;

-- Права на уже существующие таблицы/последовательности.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO conf_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO conf_app;

-- Права на будущие таблицы (новые миграции создаются владельцем conf).
ALTER DEFAULT PRIVILEGES FOR ROLE conf IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO conf_app;
ALTER DEFAULT PRIVILEGES FOR ROLE conf IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO conf_app;

-- conf_app НЕ должен иметь BYPASSRLS и НЕ должен быть владельцем — тогда RLS работает.
