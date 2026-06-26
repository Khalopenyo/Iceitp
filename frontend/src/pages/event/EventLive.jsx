import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import { isAuthenticated } from "../../lib/auth.js";
import "./event.css";

function formatSlot(value, room) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return room ? `Зал «${room}»` : "";
  const label = date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return room ? `${label} · Зал «${room}»` : label;
}

function streamStatus(startAt, endAt, now) {
  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;
  if (!start || Number.isNaN(start.getTime())) return { label: "По расписанию", variant: "neutral", live: false };
  if (end && !Number.isNaN(end.getTime()) && now >= start && now < end) {
    return { label: "В эфире", variant: "success", live: true };
  }
  if (now < start) return { label: "Скоро", variant: "warn", live: false };
  return { label: "Завершено", variant: "neutral", live: false };
}

// EventLive — экран «Трансляции» в зоне EventShell: плеер, расписание эфиров, чат/Q&A.
export default function EventLive() {
  const { conference } = useOutletContext();
  const isAuthorized = isAuthenticated();
  const [sections, setSections] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("chat");

  useEffect(() => {
    apiGet("/sections")
      .then((data) => setSections(Array.isArray(data) ? data : []))
      .catch(() => setSections([]));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const items = useMemo(
    () =>
      sections
        .filter((s) => s.start_at)
        .slice()
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
        .map((s) => ({ ...s, status: streamStatus(s.start_at, s.end_at, now) })),
    [sections, now]
  );
  const liveItem = items.find((item) => item.status.live) || null;

  const links = [
    { url: conference?.stream_vk_url, label: "Открыть на VK Видео" },
    { url: conference?.stream_youtube_url, label: "YouTube" },
    { url: conference?.stream_rutube_url, label: "Rutube" },
  ].filter((link) => link.url);

  return (
    <div className="ev-page" data-screen-label="Трансляции">
      <div className="ev-page-eyebrow">Эфиры · онлайн</div>
      <h1 className="ev-page-h tight">Трансляции</h1>

      <div className="ev-live-now">
        {liveItem ? (
          <>
            <span className="ev-badge success">В эфире сейчас</span>
            <span>
              {liveItem.title}
              {liveItem.room ? ` · Зал «${liveItem.room}»` : ""}
            </span>
          </>
        ) : (
          <span>Сейчас прямых эфиров нет. Ближайшие — в расписании ниже.</span>
        )}
      </div>

      <div className="ev-live-cols">
        <div>
          <div className="ev-player">
            {conference?.live_stream_url ? (
              <iframe
                src={conference.live_stream_url}
                title="Трансляция конференции"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : (
              "Встроенный плеер трансляции появится во время эфира"
            )}
          </div>

          {links.length > 0 ? (
            <div className="ev-live-links">
              {links.map((link) => (
                <a key={link.label} className="ev-btn-sm ghost" href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}

          <div className="ev-subhead">
            <h2>Расписание эфиров</h2>
          </div>
          {items.length === 0 ? (
            <p className="ev-empty">Расписание эфиров появится после публикации программы.</p>
          ) : (
            <div className="ev-live-schedule">
              {items.map((item) => (
                <div key={item.id} className="ev-live-item">
                  <div>
                    <strong>{item.title}</strong>
                    <span>{formatSlot(item.start_at, item.room)}</span>
                  </div>
                  <span className={`ev-badge ${item.status.variant}`}>{item.status.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside>
          <div className="ev-side-card">
            <div className="ev-tabs" role="tablist" aria-label="Чат и вопросы трансляции" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className={`ev-tab ${tab === "chat" ? "active" : ""}`}
                aria-pressed={tab === "chat"}
                onClick={() => setTab("chat")}
              >
                Чат
              </button>
              <button
                type="button"
                className={`ev-tab ${tab === "qa" ? "active" : ""}`}
                aria-pressed={tab === "qa"}
                onClick={() => setTab("qa")}
              >
                Q&amp;A
              </button>
            </div>
            {tab === "chat" ? (
              <>
                <p>Чат трансляции доступен участникам конференции в личном кабинете.</p>
                <Link className="ev-btn-sm primary block" to={isAuthorized ? "/chat" : "/login?next=/chat"}>
                  {isAuthorized ? "Открыть чат" : "Войти, чтобы участвовать"}
                </Link>
              </>
            ) : (
              <>
                <p>Вопросы спикерам модерируются и выводятся на экран в зале.</p>
                <Link className="ev-btn-sm primary block" to={isAuthorized ? "/chat" : "/login"}>
                  {isAuthorized ? "Перейти к вопросам" : "Войти, чтобы задать вопрос"}
                </Link>
              </>
            )}
          </div>

          <div className="ev-side-card">
            <strong>Задать вопрос спикеру</strong>
            <p>Вопросы модерируются и выводятся на экран в зале.</p>
            <Link className="ev-btn-sm ghost block" to={isAuthorized ? "/chat" : "/login"}>
              Новый вопрос
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
