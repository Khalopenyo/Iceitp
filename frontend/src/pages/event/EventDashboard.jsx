import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import { getConferenceTitle } from "../../lib/conference.js";
import "./event.css";

function firstName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  // Полное ФИО «Фамилия Имя Отчество» (3 токена) → приветствуем по имени (середина).
  // Иначе (2 токена неоднозначны / 1 токен) — берём первый.
  if (parts.length >= 3) return parts[1];
  return parts[0] || "участник";
}
function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}
const ASSIGNMENT_LABEL = { approved: "Принят", pending: "На рассмотрении", rejected: "Отклонён" };

const QUICK = [
  { to: "/program", label: "Программа", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" },
  { to: "/venue", label: "Площадка", icon: "M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11zM12 10a2 2 0 100-4 2 2 0 000 4" },
  { to: "/chat", label: "Чат", icon: "M4 5h16v11H9l-5 4z" },
  { to: "/documents", label: "Документы", icon: "M6 3h8l4 4v14H6zM14 3v4h4" },
];

// EventDashboard — личный кабинет участника в зоне EventShell (по прототипу редизайна).
// Конференцию берём из outlet-контекста EventShell; остальное — /me, /schedule, /sections.
export default function EventDashboard() {
  const { conference, user } = useOutletContext();
  const [me, setMe] = useState(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const [sections, setSections] = useState([]);

  useEffect(() => {
    apiGet("/me").then(setMe).catch(() => setMe(null)).finally(() => setMeLoaded(true));
    apiGet("/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
    apiGet("/schedule")
      .then((r) => {
        setSchedule(r?.schedule || null);
        setAssignmentStatus(r?.assignment_status || "");
      })
      .catch(() => {
        setSchedule(null);
        setAssignmentStatus("");
      });
  }, []);

  const profile = me?.profile || {};
  const isOnline = me?.user_type === "online";
  const isAuthor = Boolean(profile.talk_title || schedule?.talk_title);

  const sectionName = useMemo(() => {
    const sid = profile.section_id;
    return schedule?.section_title || sections.find((s) => String(s.id) === String(sid))?.title || "";
  }, [profile, schedule, sections]);

  const program = useMemo(
    () =>
      sections
        .filter((s) => s.start_at)
        .slice()
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
        .slice(0, 6),
    [sections]
  );

  const days = daysUntil(conference?.starts_at);
  const greetingName = firstName(profile.full_name || user?.profile?.full_name);
  const hasSlot = schedule && schedule.starts_at;
  const timeLabel = hasSlot
    ? `${formatTime(schedule.starts_at)}${schedule.ends_at ? `–${formatTime(schedule.ends_at)}` : ""}`
    : "уточняется";

  let countdown = "Личный кабинет участника.";
  if (typeof days === "number") {
    if (days > 1) countdown = `До начала конференции — ${days} дн. Всё готово к участию.`;
    else if (days === 1) countdown = "До начала конференции — 1 день. Всё готово к участию.";
    else if (days === 0) countdown = "Конференция сегодня. Хорошего дня!";
    else countdown = "Спасибо за участие в конференции.";
  }

  if (!meLoaded) {
    return <div className="ev-page" role="status" aria-busy="true" aria-label="Загрузка кабинета" style={{ minHeight: "40vh" }} />;
  }
  if (!me) {
    return (
      <div className="ev-page" data-screen-label="Кабинет">
        <div className="ev-page-eyebrow">Личный кабинет</div>
        <h1 className="ev-page-h">Кабинет участника</h1>
        <p className="ev-empty">Не удалось загрузить данные участника. Обновите страницу или войдите заново.</p>
      </div>
    );
  }

  return (
    <div className="ev-page" data-screen-label="Кабинет">
      <div className="ev-page-eyebrow">Личный кабинет</div>
      <h1 className="ev-page-h">Здравствуйте, {greetingName}</h1>
      <p className="ev-page-sub">{countdown}</p>

      <div className="ev-dash-grid">
        {/* Ваша секция / участие */}
        <div className="ev-dash-accent">
          <h2 className="ev-dash-lab">{sectionName ? "Ваша секция" : "Ваше участие"}</h2>
          <div className="ev-dash-ttl">
            {sectionName || getConferenceTitle(conference)}
          </div>
          <div className="ev-dash-kv">
            <div>
              <div className="k">Зал</div>
              <div className="v">{schedule?.room_name || "—"}</div>
            </div>
            <div>
              <div className="k">Время</div>
              <div className="v">{timeLabel}</div>
            </div>
            <div>
              <div className="k">Формат</div>
              <div className="v">{isOnline ? "Онлайн" : "Очно"}</div>
            </div>
          </div>
          <Link className="ev-btn-onacc" to={isOnline ? "/live" : "/venue"}>
            {isOnline ? "Открыть трансляцию →" : "Построить маршрут к залу →"}
          </Link>
        </div>

        {/* Ваш доклад / статус */}
        <div className="ev-card">
          <h2 className="ev-dash-card-lab">{isAuthor ? "Ваш доклад" : "Ваш статус"}</h2>
          {isAuthor ? (
            <>
              <div className="ev-dash-doc-title">«{schedule?.talk_title || profile.talk_title}»</div>
              <div className="ev-dash-stat">
                <span>Статус</span>
                <span className={`val ${assignmentStatus === "approved" ? "ok" : ""}`}>
                  {ASSIGNMENT_LABEL[assignmentStatus] || "Формируется"}
                </span>
              </div>
              <div className="ev-dash-stat">
                <span>Формат участия</span>
                <span className="val">{isOnline ? "Онлайн" : "Очно"}</span>
              </div>
            </>
          ) : (
            <>
              <div className="ev-dash-doc-title">Вы — слушатель конференции</div>
              <div className="ev-dash-stat">
                <span>Формат участия</span>
                <span className="val">{isOnline ? "Онлайн" : "Очно"}</span>
              </div>
              <div className="ev-dash-stat">
                <span>Бейдж участника</span>
                <Link className="val" to="/documents" style={{ color: "var(--ev-accent)" }}>
                  Открыть →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Программа дня */}
      <div className="ev-card" style={{ marginBottom: 14 }}>
        <h2 className="ev-dash-card-lab">Программа конференции</h2>
        {program.length === 0 ? (
          <p className="ev-empty" style={{ margin: 0 }}>
            Расписание появится после публикации программы организатором.
          </p>
        ) : (
          program.map((s) => (
            <div className="ev-dash-prog-row" key={s.id}>
              <span className="ev-dash-prog-time">
                {formatTime(s.start_at)}
                {s.end_at ? `–${formatTime(s.end_at)}` : ""}
              </span>
              <span className="ev-dash-prog-title">{s.title}</span>
              <span className="ev-dash-prog-place">{s.room ? `Зал «${s.room}»` : "зал уточняется"}</span>
            </div>
          ))
        )}
      </div>

      {/* Быстрый доступ */}
      <div className="ev-grid-4">
        {QUICK.map((q) => (
          <Link className="ev-quick" to={q.to} key={q.to}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={q.icon} />
            </svg>
            {q.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
