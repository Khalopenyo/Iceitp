# Фаза 0 · Аудит write-path (под Ф1/Ф2)

Перечень мутирующих хендлеров, которые `Create`/`Save` модели, получающие в Ф1 колонку `conference_id`/`organization_id`. **Каждый из них обязан проставлять `conference_id` (и/или `organization_id`) ДО флипа `NOT NULL`** (см. ADR-0003, порядок: nullable → backfill → аудит → NOT NULL). Иначе вставка падает на prod Postgres, при этом SQLite-тесты (где `NOT NULL`-флип пропускается) этого не ловят.

| # | Хендлер | Файл | Модель | conf_id ставится? | Действие в Ф1/Ф2 |
|---|---|---|---|---|---|
| 1 | `CreateSection` | handlers/sections.go | Section | нет | проставить conf_id из контекста |
| 2 | `UpdateSection` | handlers/sections.go | Section | n/a (update) | проверить scope |
| 3 | `CreateRoom` | handlers/rooms.go | Room | нет | проставить conf_id |
| 4 | `ReplaceMarkers` | handlers/map_markers.go:~62 | MapMarker | **нет (struct-literal)** | проставить conf_id в литерал — подтверждённый offender |
| 5 | `UpsertRoute` | handlers/map_routes.go | MapRoute | нет | проставить conf_id |
| 6 | `CreateFeedback` | handlers/feedback.go | Feedback | нет | проставить conf_id |
| 7 | `PostMessage` | handlers/chat.go | ChatMessage | нет | проставить conf_id |
| 8 | `UpsertProgramAssignment` | handlers/program.go | ProgramAssignment | нет | проставить conf_id; индекс (conf_id,user_id) |
| 9 | `CreateSubmission` | handlers/submissions.go | ArticleSubmission | нет | проставить conf_id |
| 10 | `getOrCreateConference` (авто-создание) | handlers/conference.go:~99 | Conference | **нет org_id** | проставить `OrganizationID = DefaultOrgID` |
| 11 | `EnsureFirstRun` / bootstrap | db/firstrun.go, cmd/server/main.go | Org+Conf+секции/залы | — | org#1 создаётся первым; данные с conf_id |

**Уже скоупленные (только backfill, без правок Create):** CheckIn, Certificate, Question — поле `ConferenceID uint` уже есть и заполняется.

**Проверка перед флипом NOT NULL (Ф1):** для каждого пункта 1–11 — тест «Create без conf_id отклоняется / Create через хендлер ставит conf_id».
