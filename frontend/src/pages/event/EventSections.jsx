import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLanding } from "../../lib/landing.js";
import "./event.css";

function pad(value) {
  return String(value).padStart(2, "0");
}
function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function formatDayShort(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

// EventSections — экран «Секции» в зоне EventShell: поиск + фильтр по дню + сетка карточек.
export default function EventSections() {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeDay, setActiveDay] = useState("");

  useEffect(() => {
    fetchLanding()
      .then((data) => setSections(data?.sections || []))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => {
    const map = new Map();
    for (const section of sections) {
      if (!section.start_at) continue;
      const key = localDayKey(section.start_at);
      if (key && !map.has(key)) map.set(key, formatDayLabel(section.start_at));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }));
  }, [sections]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sections.filter((section) => {
      if (activeDay && localDayKey(section.start_at) !== activeDay) return false;
      if (normalized && !`${section.title} ${section.description || ""}`.toLowerCase().includes(normalized)) {
        return false;
      }
      return true;
    });
  }, [sections, query, activeDay]);

  return (
    <div className="ev-page" data-screen-label="Секции">
      <div className="ev-page-eyebrow">Секции · {sections.length}</div>
      <h1 className="ev-page-h tight">Тематические секции</h1>

      <div className="ev-toolbar">
        <input
          className="ev-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          aria-label="Поиск секции по названию"
        />
      </div>

      {days.length > 1 ? (
        <div className="ev-tabs" role="group" aria-label="Фильтр по дню">
          <button
            type="button"
            className={`ev-tab ${activeDay === "" ? "active" : ""}`}
            aria-pressed={activeDay === ""}
            onClick={() => setActiveDay("")}
          >
            Все дни
          </button>
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              className={`ev-tab ${activeDay === day.key ? "active" : ""}`}
              aria-pressed={activeDay === day.key}
              onClick={() => setActiveDay(day.key)}
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="ev-empty">Загружаю секции…</p>
      ) : visible.length === 0 ? (
        <p className="ev-empty">
          {sections.length === 0 ? "Секции пока не опубликованы." : "По вашему запросу секции не найдены."}
        </p>
      ) : (
        <div className="ev-cards">
          {visible.map((section, index) => (
            <article key={section.id} className="ev-card ev-card-flex">
              <div className="ev-card-num" aria-hidden="true">
                С{index + 1}
              </div>
              <h3>{section.title}</h3>
              {section.description ? <p className="ev-card-p">{section.description}</p> : null}
              <div className="ev-card-meta">
                {typeof section.talks_count === "number" ? <span>{section.talks_count} докл.</span> : null}
                {section.start_at ? <span>{formatDayShort(section.start_at)}</span> : null}
                {section.room ? <span>Зал «{section.room}»</span> : null}
              </div>
              <a
                className="ev-card-link"
                href={`/sections/${section.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/sections/${section.id}`);
                }}
              >
                Подробнее →
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
