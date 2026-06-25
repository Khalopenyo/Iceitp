import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api.js";
import { Container } from "../components/ui/index.jsx";
import "./program.css";

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

function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function Program() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(null);

  useEffect(() => {
    apiGet("/sections")
      .then((data) => setSections(Array.isArray(data) ? data : []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => {
    const map = new Map();
    for (const section of sections) {
      if (!section.start_at) {
        continue;
      }
      const key = localDayKey(section.start_at);
      if (!key) {
        continue;
      }
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(section);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        key,
        label: formatDayLabel(items[0].start_at),
        items: items.slice().sort((x, y) => new Date(x.start_at) - new Date(y.start_at)),
      }));
  }, [sections]);

  const rooms = useMemo(
    () => new Set(sections.map((s) => s.room).filter(Boolean)).size,
    [sections]
  );

  const current = days.find((d) => d.key === activeDay) || days[0] || null;
  const dateRangeLabel =
    days.length > 0
      ? days.length === 1
        ? formatDayLabel(days[0].items[0].start_at)
        : `${formatDayLabel(days[0].items[0].start_at)} — ${formatDayLabel(days[days.length - 1].items[0].start_at)}`
      : "";

  return (
    <section className="program">
      <Container>
        <div className="program-head">
          <h1>Программа</h1>
          <p>
            {dateRangeLabel ? `${dateRangeLabel} · ` : ""}
            {sections.length} секций
            {rooms ? ` · ${rooms} залов` : ""}
          </p>
        </div>

        {loading ? (
          <p className="program-empty">Загружаю программу…</p>
        ) : days.length === 0 ? (
          <p className="program-empty">
            Программа пока формируется. Расписание секций появится после утверждения организаторами.
          </p>
        ) : (
          <>
            {days.length > 1 ? (
              <div className="program-tabs" role="tablist" aria-label="Дни программы">
                {days.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    className={`program-tab ${current && current.key === day.key ? "active" : ""}`}
                    aria-pressed={current && current.key === day.key}
                    onClick={() => setActiveDay(day.key)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="program-list">
              {current.items.map((section) => (
                <article key={section.id} className="program-item">
                  <div className="program-time">
                    {formatTime(section.start_at)}
                    {section.end_at ? `–${formatTime(section.end_at)}` : ""}
                  </div>
                  <div className="program-item-body">
                    <strong>{section.title}</strong>
                    {section.description ? <p>{section.description}</p> : null}
                    <div className="program-item-meta">
                      {section.room ? <span>Зал «{section.room}»</span> : null}
                      {section.capacity ? <span>До {section.capacity} участников</span> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <p className="program-note">
              Программа на уровне секций. Детальное расписание докладов с авторами публикуется
              организаторами по мере утверждения.
            </p>
          </>
        )}
      </Container>
    </section>
  );
}
