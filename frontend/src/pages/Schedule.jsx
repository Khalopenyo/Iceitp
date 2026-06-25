import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import "./lk.css";

const I = {
  filter: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z"/></svg>,
  door: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>,
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>,
  message: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v11H9l-4 4V5z"/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>,
};

function dayKey(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}
function dayLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
}
function dayTab(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
function hhmm(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function icsStamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildICS(sections) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ConferenceHub//RU", "CALSCALE:GREGORIAN"];
  sections.forEach((s, i) => {
    if (!s.start_at) return;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:section-${s.id}-${i}@conferencehub`);
    lines.push(`DTSTART:${icsStamp(s.start_at)}`);
    if (s.end_at) lines.push(`DTEND:${icsStamp(s.end_at)}`);
    lines.push(`SUMMARY:${(s.title || "Сессия").replace(/[,;\n]/g, " ")}`);
    if (s.room) lines.push(`LOCATION:Зал «${s.room}»`);
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
      .filter((s) => s.start_at)
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
    const ics = buildICS(sections.filter((s) => s.start_at));
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
        <div className="lk-segm" role="tablist" aria-label="Вид программы">
          <button type="button" className="lk-segm-tab active" aria-selected="true">Моё расписание</button>
          <Link to="/program" className="lk-segm-tab">Полная программа</Link>
        </div>

        {days.length > 1 ? (
          <div className="lk-daytabs">
            {days.map((d, idx) => (
              <button
                key={d.key}
                type="button"
                className={`lk-daytab ${idx === activeDay ? "active" : ""}`}
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
