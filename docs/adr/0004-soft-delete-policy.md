# ADR-0004 · Политика soft-delete

- **Статус:** Принято
- **Дата:** 2026-06-20

## Решение

- **Фаза 0:** `gorm.DeletedAt` (soft-delete) добавляется **только на `Conference`** — единственная строка в prod, нет unique-индексов, читается через `First()` (GORM авто-добавит `deleted_at IS NULL`, живая строка с NULL разрешается). Колонка инертна: ни один код не soft-удаляет конференцию.
- **`User.DeletedAt` ОТЛОЖЕН до Фазы 2.** Причина (воспроизведено): добавление `DeletedAt` на `User` **молча превращает `DeleteUser` в soft-delete** (`users.go` делает `tx.Delete` без `Unscoped()`), а soft-удалённая строка продолжает занимать **уникальный индекс `email`** → повторная регистрация того же email падает с UNIQUE constraint. В Фазу 2 `User.DeletedAt` приходит вместе с partial-unique индексом `... WHERE deleted_at IS NULL` и/или `Unscoped()`-aware удалением.
- **Исключены из soft-delete в Ф0** (replace-all / partial-unique / каскады): Section, Room, MapMarker, MapRoute, Feedback, ChatMessage, Profile, ProgramAssignment. Их lifecycle — позже.

## Следствия

- Перед Фазой 2 — аудит `DeleteUser` и всех каскадов; решение по `Unscoped()` vs partial-unique.
