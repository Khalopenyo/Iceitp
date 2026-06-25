import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { formatConferenceDateRange, getConferenceTitle } from "../lib/conference.js";
import { icons as I } from "../components/lkIcons.jsx";
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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const [conference, setConference] = useState(null);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    apiGet("/me").then(setData).catch(() => setData(null));
    apiGet("/conference").then(setConference).catch(() => setConference(null));
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

  // Название секции: из утверждённого расписания, иначе резолв по profile.section_id.
  const sectionName = useMemo(() => {
    const sid = data?.profile?.section_id;
    return schedule?.section_title || sections.find((s) => String(s.id) === String(sid))?.title || "";
  }, [data, schedule, sections]);

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
  const orgLine = [profile.organization, sectionName].filter(Boolean).join(" · ");
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
              {sectionName ? (
                <div className="lk-meta" style={{ marginBottom: "4px" }}>
                  {I.grid} Секция «{sectionName}»
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
                <span>для доклада в секции «{sectionName || "—"}»</span>
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
