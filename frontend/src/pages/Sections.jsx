import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLanding } from "../lib/landing.js";
import { Container } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./sections.css";

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDayShort(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export default function Sections() {
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
      if (!section.start_at) {
        continue;
      }
      const key = localDayKey(section.start_at);
      if (key && !map.has(key)) {
        map.set(key, formatDayLabel(section.start_at));
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }));
  }, [sections]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sections.filter((section) => {
      if (activeDay && localDayKey(section.start_at) !== activeDay) {
        return false;
      }
      if (normalized && !`${section.title} ${section.description}`.toLowerCase().includes(normalized)) {
        return false;
      }
      return true;
    });
  }, [sections, query, activeDay]);

  return (
    <section className="sections-page">
      <Container>
        <div className="sections-head">
          <h1>
            Секции <span>· {sections.length}</span>
          </h1>
          <input
            className="sections-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск секции по названию"
          />
        </div>

        {days.length > 1 ? (
          <div className="sections-days" role="group" aria-label="Фильтр по дню">
            <button
              type="button"
              className={`sections-day ${activeDay === "" ? "active" : ""}`}
              aria-pressed={activeDay === ""}
              onClick={() => setActiveDay("")}
            >
              Все дни
            </button>
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`sections-day ${activeDay === day.key ? "active" : ""}`}
                aria-pressed={activeDay === day.key}
                onClick={() => setActiveDay(day.key)}
              >
                {day.label}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <p className="sections-empty">Загружаю секции…</p>
        ) : visible.length === 0 ? (
          <p className="sections-empty">
            {sections.length === 0
              ? "Секции пока не опубликованы."
              : "По вашему запросу секции не найдены."}
          </p>
        ) : (
          <div className="sections-grid">
            {visible.map((section, index) => (
              <article key={section.id} className="section-card">
                <div className="section-card-ic" aria-hidden="true">
                  {index + 1}
                </div>
                <h2>{section.title}</h2>
                {section.description ? <p>{section.description}</p> : null}
                <div className="section-card-meta">
                  <span>{section.talks_count} докл.</span>
                  {section.start_at ? <span>{formatDayShort(section.start_at)}</span> : null}
                  {section.room ? <span>Зал «{section.room}»</span> : null}
                </div>
                <Link className={buttonClassName("ghost")} to={`/sections/${section.id}`}>
                  Подробнее
                </Link>
              </article>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
