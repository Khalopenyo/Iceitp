import { triggerBlobDownload } from "../../lib/download.js";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import "./event.css";

// Go-нулевая дата валидна для Date, но не настоящее время — секции без слота не в днях.
function hasRealTime(value) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1;
}
function dayKey(value) { return new Date(value).toLocaleDateString("ru-RU"); }
function dayLabel(value) { return new Date(value).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" }); }
function dayTab(value) { return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }); }
function hhmm(value) { return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function icsStamp(value) { return new Date(value).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
function escapeICS(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
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

// EventSchedule — «Моё расписание» участника в зоне EventShell: дни + сессии (свой
// доклад подсвечен) + экспорт ICS. Логика из старого Schedule (LK).
export default function EventSchedule() {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [mySectionId, setMySectionId] = useState(null);
  const [myTalk, setMyTalk] = useState("");
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => {
    apiGet("/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
    apiGet("/me").then((r) => { setMySectionId(r?.profile?.section_id ?? null); setMyTalk(r?.profile?.talk_title || ""); }).catch(() => {});
  }, []);

  const days = useMemo(() => {
    const map = new Map();
    sections.filter((s) => hasRealTime(s.start_at)).forEach((s) => {
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
    triggerBlobDownload(blob, "raspisanie.ics");
  };

  return (
    <div className="ev-page" data-screen-label="Расписание">
      <div className="ev-page-eyebrow">Программа</div>
      <h1 className="ev-page-h tight">Моё расписание</h1>

      <div className="ev-segm" role="group" aria-label="Вид программы">
        <button type="button" className="active" aria-current="page">Моё расписание</button>
        <Link to="/program">Полная программа</Link>
      </div>

      <div className="ev-sched-toolrow">
        <span style={{ flex: 1 }} />
        <button type="button" className="ev-btn-sm ghost" onClick={exportICS}>В календарь (ICS)</button>
      </div>

      {days.length > 1 ? (
        <div className="ev-tabs" role="group" aria-label="День программы">
          {days.map((d, idx) => (
            <button key={d.key} type="button" className={`ev-tab ${idx === activeDay ? "active" : ""}`} aria-pressed={idx === activeDay} onClick={() => setActiveDay(idx)}>
              {d.tab}
            </button>
          ))}
        </div>
      ) : null}

      {day ? (
        <>
          <div className="ev-section-eyebrow" style={{ marginBottom: 8 }}>{day.label}</div>
          <div className="ev-sched">
            {day.items.map((s) => {
              const mine = mySectionId != null && String(s.id) === String(mySectionId);
              return (
                <div key={s.id} className={`ev-sched-row ${mine ? "mine" : ""}`}>
                  <div className="ev-sched-time">{hhmm(s.start_at)}{hasRealTime(s.end_at) ? `–${hhmm(s.end_at)}` : ""}</div>
                  <div className="ev-sched-ev">
                    {mine ? <span className="ev-sched-mine-tag">Мой доклад</span> : null}
                    <b>{mine && myTalk ? myTalk : s.title}</b>
                    <div className="ev-sched-meta">
                      {mine && myTalk ? `Секция «${s.title}»` : s.chair ? `Председатель: ${s.chair}` : "Сессия"}
                      {s.room ? ` · Зал «${s.room}»` : ""}
                    </div>
                    {mine ? (
                      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                        <button type="button" className="ev-btn-sm ghost" onClick={() => navigate("/venue")}>Как пройти</button>
                        <Link className="ev-btn-sm ghost" to={`/sections/${s.id}`}>Подробнее</Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="ev-empty">Расписание появится после публикации программы организатором.</p>
      )}
    </div>
  );
}
