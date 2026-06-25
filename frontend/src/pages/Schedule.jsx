import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { icons as I } from "../components/lkIcons.jsx";
import "./lk.css";

// Go-нулевая дата ("0001-01-01T00:00:00Z") валидна для Date, но не является
// настоящим временем — секции без назначенного слота не должны попадать в дни.
function hasRealTime(value) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1;
}
function dayKey(value) {
  return new Date(value).toLocaleDateString("ru-RU");
}
function dayLabel(value) {
  return new Date(value).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
}
function dayTab(value) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
function hhmm(value) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function icsStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
// Экранирование текста по RFC 5545 §3.3.11.
function escapeICS(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildICS(sections) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ConferenceHub//RU", "CALSCALE:GREGORIAN"];
  sections.forEach((s, i) => {
    if (!hasRealTime(s.start_at)) return;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:section-${s.id}-${i}@conferencehub`);
    lines.push(`DTSTART:${icsStamp(s.start_at)}`);
    if (hasRealTime(s.end_at)) lines.push(`DTEND:${icsStamp(s.end_at)}`);
    lines.push(`SUMMARY:${escapeICS(s.title || "Сессия")}`);
    if (s.room) lines.push(`LOCATION:${escapeICS(`Зал «${s.room}»`)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function Schedule() {
  const [sections, setSections] = useState([]);
  const [mySectionId, setMySectionId] = useState(null);
  const [myTalk, setMyTalk] = useState("");
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => {
    apiGet("/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
    apiGet("/me")
      .then((r) => {
        setMySectionId(r?.profile?.section_id ?? null);
        setMyTalk(r?.profile?.talk_title || "");
      })
      .catch(() => {});
  }, []);

  const days = useMemo(() => {
    const map = new Map();
    sections
      .filter((s) => hasRealTime(s.start_at))
      .forEach((s) => {
        const k = dayKey(s.start_at);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(s);
      });
    return [...map.entries()]
      .map(([k, items]) => ({
        key: k,
        label: dayLabel(items[0].start_at),
        tab: dayTab(items[0].start_at),
        items: items.slice().sort((a, b) => new Date(a.start_at) - new Date(b.start_at)),
      }))
      .sort((a, b) => new Date(a.items[0].start_at) - new Date(b.items[0].start_at));
  }, [sections]);

  const day = days[activeDay] || null;

  const exportICS = () => {
    const ics = buildICS(sections.filter((s) => hasRealTime(s.start_at)));
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "raspisanie.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="lk-topbar">
        <div className="lk-topbar-title">Программа</div>
        <div className="lk-spacer" />
        <span className="lk-iconbtn" aria-hidden="true">{I.filter}</span>
      </div>

      <div className="lk-main">
        <nav className="lk-segm" aria-label="Вид программы">
          <button type="button" className="lk-segm-tab active" aria-current="page">Моё расписание</button>
          <Link to="/program" className="lk-segm-tab">Полная программа</Link>
        </nav>

        <div className="lk-toolrow">
          <span className="lk-chip lk-chip-solid">{I.list} Список</span>
          <span className="lk-chip lk-chip-soon" aria-disabled="true">{I.layout} Сетка</span>
          <div className="lk-spacer" />
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={exportICS}>{I.cal} В календарь</button>
        </div>

        {days.length > 1 ? (
          <div className="lk-daytabs" role="group" aria-label="День программы">
            {days.map((d, idx) => (
              <button
                key={d.key}
                type="button"
                className={`lk-daytab ${idx === activeDay ? "active" : ""}`}
                aria-pressed={idx === activeDay}
                onClick={() => setActiveDay(idx)}
              >
                {d.tab}
              </button>
            ))}
          </div>
        ) : null}

        {day ? (
          <>
            <div className="lk-day-sep">{day.label}</div>
            <div className="lk-sched">
              {day.items.map((s) => {
                const mine = mySectionId != null && String(s.id) === String(mySectionId);
                return (
                  <div key={s.id} className={`lk-sched-row ${mine ? "mine" : ""}`}>
                    <div className="lk-sched-time">{hhmm(s.start_at)}</div>
                    <div className="lk-sched-ev">
                      {mine ? <span className="lk-chip lk-chip-count" style={{ marginBottom: "4px" }}>Мой доклад</span> : null}
                      <b>{mine && myTalk ? myTalk : s.title}</b>
                      <div className="lk-meta" style={{ marginTop: "2px" }}>
                        {I.grid} {mine && myTalk ? `Секция «${s.title}»` : s.chair ? `Председатель: ${s.chair}` : "Сессия"}
                      </div>
                      {s.room ? (
                        <div className="lk-meta">{I.door} Зал «{s.room}»</div>
                      ) : null}
                      {mine ? (
                        <div className="lk-chips" style={{ marginTop: "6px" }}>
                          <Link to="/map" className="ui-btn ui-btn-ghost ui-btn-sm">{I.map} Как пройти</Link>
                          <Link to={`/sections/${s.id}`} className="ui-btn ui-btn-ghost ui-btn-sm">{I.message} Подробнее</Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-block" style={{ margin: "14px 0" }} onClick={exportICS}>
              {I.download} Экспортировать расписание (ICS)
            </button>
          </>
        ) : (
          <div className="lk-card-flat">Расписание появится после публикации программы.</div>
        )}
      </div>
    </>
  );
}
