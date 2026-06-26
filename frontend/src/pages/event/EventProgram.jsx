import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import "./event.css";

function pad(value) {
  return String(value).padStart(2, "0");
}
function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}
function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// EventProgram — экран «Программа» в зоне EventShell. Таймлайн строится из реальных
// секций (у платформы нет отдельной сущности расписания), как в прототипе редизайна.
export default function EventProgram() {
  const navigate = useNavigate();
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
      if (!section.start_at) continue;
      const key = localDayKey(section.start_at);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
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

  const rooms = useMemo(() => new Set(sections.map((s) => s.room).filter(Boolean)).size, [sections]);
  const current = days.find((d) => d.key === activeDay) || days[0] || null;
  const dateRangeLabel =
    days.length > 0
      ? days.length === 1
        ? formatDayLabel(days[0].items[0].start_at)
        : `${formatDayLabel(days[0].items[0].start_at)} — ${formatDayLabel(days[days.length - 1].items[0].start_at)}`
      : "";

  return (
    <div className="ev-page" data-screen-label="Программа">
      <div className="ev-page-eyebrow">Программа{dateRangeLabel ? ` · ${dateRangeLabel}` : ""}</div>
      <h1 className="ev-page-h">Расписание и секции</h1>
      <p className="ev-page-sub">
        {sections.length} секций{rooms ? ` · ${rooms} залов` : ""}
      </p>

      {loading ? (
        <p className="ev-empty">Загружаю программу…</p>
      ) : days.length === 0 ? (
        <p className="ev-empty">
          Программа пока формируется. Расписание секций появится после утверждения организаторами.
        </p>
      ) : (
        <>
          {days.length > 1 ? (
            <div className="ev-tabs" role="tablist" aria-label="Дни программы">
              {days.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  className={`ev-tab ${current && current.key === day.key ? "active" : ""}`}
                  aria-pressed={current && current.key === day.key}
                  onClick={() => setActiveDay(day.key)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="ev-timeline">
            {current.items.map((section) => (
              <a
                key={section.id}
                className="ev-tl-row"
                href={`/sections/${section.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/sections/${section.id}`);
                }}
              >
                <div className="ev-tl-time">
                  {formatTime(section.start_at)}
                  {section.end_at ? `–${formatTime(section.end_at)}` : ""}
                </div>
                <div className="ev-tl-body">
                  <div className="ev-tl-title">{section.title}</div>
                  <div className="ev-tl-meta">
                    {[section.room ? `Зал «${section.room}»` : null, section.capacity ? `до ${section.capacity} участников` : null]
                      .filter(Boolean)
                      .join(" · ") || "зал уточняется"}
                  </div>
                  {section.description ? <p className="ev-tl-desc">{section.description}</p> : null}
                </div>
              </a>
            ))}
          </div>

          <p className="ev-empty">
            Программа на уровне секций. Детальное расписание докладов публикуется организаторами по
            мере утверждения.
          </p>
        </>
      )}
    </div>
  );
}
