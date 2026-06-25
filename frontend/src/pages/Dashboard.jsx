import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { formatConferenceDateRange, getConferenceTitle } from "../lib/conference.js";
import "./lk.css";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "У";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}. ${parts[2][0]}.`;
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`;
  return name || "Участник";
}

function formatSlot(startsAt) {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const I = {
  pin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>,
  qr: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7"/></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>,
  building: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M9 7h2M9 11h2M9 15h2M15 21V11h2a2 2 0 0 1 2 2v8"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>,
  door: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>,
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/></svg>,
  id: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 9h4M14 13h4M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2"/></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>,
  message: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v11H9l-4 4V5z"/></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z"/></svg>,
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6"/></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10 20a2 2 0 0 0 4 0"/></svg>,
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const [conference, setConference] = useState(null);

  useEffect(() => {
    apiGet("/me").then(setData).catch(() => setData(null));
    apiGet("/conference").then(setConference).catch(() => setConference(null));
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

  if (!data) {
    return (
      <>
        <div className="lk-topbar">
          <div className="lk-topbar-title">Личный кабинет</div>
        </div>
        <div className="lk-main">
          <div className="lk-card-flat">Войдите в систему, чтобы увидеть данные участника.</div>
        </div>
      </>
    );
  }

  const profile = data.profile || {};
  const fullName = profile.full_name || "Участник";
  const isOnline = data.user_type === "online";
  const isAuthor = Boolean(profile.talk_title);
  const approved = assignmentStatus === "approved";
  const orgLine = [profile.organization, schedule?.section_title || profile.section_title]
    .filter(Boolean)
    .join(" · ");
  const dateLabel = formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const hasSlot = approved && schedule && schedule.starts_at;

  return (
    <>
      <div className="lk-topbar">
        <div className="lk-avatar">{initials(fullName)}</div>
        <div className="lk-topbar-id">
          <div className="lk-topbar-name">{shortName(fullName)}</div>
          {orgLine ? <div className="lk-topbar-sub">{orgLine}</div> : null}
        </div>
        <div className="lk-spacer" />
        <Link className="lk-iconbtn" to="/feedback" aria-label="Обратная связь">
          {I.bell}
        </Link>
      </div>

      <div className="lk-main">
        {/* Карточка участия */}
        <div className="lk-card-flat">
          <div className="lk-chips" style={{ marginBottom: "8px" }}>
            <span className="lk-chip lk-chip-solid">{I.pin} {isOnline ? "Онлайн" : "Офлайн"}</span>
            <span className="lk-chip">{I.mic} {isAuthor ? "Автор" : "Слушатель"}</span>
            {approved ? <span className="lk-chip lk-chip-ok">{I.check} Подтверждён</span> : null}
          </div>
          <div className="lk-label">Конференция</div>
          <div style={{ fontWeight: 700, fontSize: "13.5px", margin: "2px 0 6px", color: "var(--text)" }}>
            {getConferenceTitle(conference) || "Конференция"}
          </div>
          <div className="lk-meta">
            {dateLabel ? <>{I.cal} {dateLabel}</> : null}
            {conference?.venue_address ? <>{I.building} {conference.venue_address}</> : null}
          </div>
          <Link className="ui-btn ui-btn-primary ui-btn-block" to="/documents" style={{ marginTop: "10px" }}>
            {I.qr} Показать бейдж / QR
          </Link>
        </div>

        {/* Моё место в программе */}
        <div className="lk-h3">Моё место в программе</div>
        <div className="lk-card">
          {hasSlot || schedule?.talk_title || profile.talk_title ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--text)" }}>
                {schedule?.talk_title || profile.talk_title || "Ваш доклад"}
              </div>
              {schedule?.section_title || profile.section_title ? (
                <div className="lk-meta" style={{ marginBottom: "4px" }}>
                  {I.grid} Секция «{schedule?.section_title || profile.section_title}»
                </div>
              ) : null}
              <div className="lk-meta" style={{ marginBottom: "8px" }}>
                {schedule?.room_name ? <>{I.door} Зал «{schedule.room_name}»</> : null}
                {hasSlot ? <>{I.clock} {formatSlot(schedule.starts_at)}</> : null}
              </div>
              <div className="lk-chips">
                <Link className="ui-btn ui-btn-ghost ui-btn-sm" to="/schedule">{I.cal} В расписание</Link>
                <Link className="ui-btn ui-btn-ghost ui-btn-sm" to="/map">{I.map} Как пройти</Link>
              </div>
            </>
          ) : (
            <p className="lk-note" style={{ margin: 0 }}>
              {I.clock} Назначение секции формируется — детали появятся после утверждения программы.
            </p>
          )}
        </div>

        {/* Ближайшие действия */}
        <div className="lk-h3">Ближайшие действия</div>
        <div className="lk-list">
          {isAuthor ? (
            <Link className="lk-li" to="/documents">
              <span className="lk-li-ic">{I.upload}</span>
              <span className="lk-li-tx">
                <b>Загрузить презентацию</b>
                <span>для доклада в секции «{schedule?.section_title || profile.section_title || "—"}»</span>
              </span>
              <span className="lk-li-chevron">{I.chevron}</span>
            </Link>
          ) : null}
          <Link className="lk-li" to="/consent-authors">
            <span className="lk-li-ic">{I.shield}</span>
            <span className="lk-li-tx">
              <b>Подписать согласие 152-ФЗ</b>
              <span>публикация в сборнике трудов</span>
            </span>
            <span className="lk-li-chevron">{I.chevron}</span>
          </Link>
          <Link className="lk-li" to="/documents">
            <span className="lk-li-ic">{I.id}</span>
            <span className="lk-li-tx">
              <b>Скачать бейдж</b>
              <span>можно сохранить офлайн</span>
            </span>
            <span className="lk-li-chevron">{I.chevron}</span>
          </Link>
        </div>

        {/* Быстрый доступ */}
        <div className="lk-h3">Быстрый доступ</div>
        <div className="lk-grid">
          <Link className="lk-tile" to="/documents">
            <span className="lk-tile-ic">{I.doc}</span>
            Документы
          </Link>
          <Link className="lk-tile" to="/chat">
            <span className="lk-tile-ic">{I.message}</span>
            Чат
          </Link>
          <Link className="lk-tile" to="/map">
            <span className="lk-tile-ic">{I.map}</span>
            Карта
          </Link>
          <Link className="lk-tile" to="/feedback">
            <span className="lk-tile-ic">{I.star}</span>
            Обратная связь
          </Link>
        </div>

        {/* Объявления оргкомитета */}
        <div className="lk-h3">Объявления оргкомитета</div>
        <div className="lk-card-flat">
          <div className="lk-meta">{I.bell} Следите за объявлениями оргкомитета в чате конференции.</div>
          <Link className="ui-btn ui-btn-ghost ui-btn-sm" to="/chat" style={{ marginTop: "8px" }}>
            Открыть общий чат
          </Link>
        </div>
      </div>
    </>
  );
}
