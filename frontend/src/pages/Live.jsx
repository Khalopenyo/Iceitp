import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { isAuthenticated } from "../lib/auth.js";
import { Container, Badge } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./live.css";

function formatSlot(value, room) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return room ? `Зал «${room}»` : "";
  }
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
  if (!start || Number.isNaN(start.getTime())) {
    return { label: "По расписанию", variant: "neutral", live: false };
  }
  if (end && !Number.isNaN(end.getTime()) && now >= start && now < end) {
    return { label: "В эфире", variant: "success", live: true };
  }
  if (now < start) {
    return { label: "Скоро", variant: "warn", live: false };
  }
  return { label: "Завершено", variant: "neutral", live: false };
}

export default function Live() {
  const outletContext = useOutletContext() || {};
  const conference = outletContext.conference || null;
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
    <section className="live-page">
      <Container>
        <div className="live-head">
          <h1>Трансляции</h1>
        </div>
        <div className="live-now">
          {liveItem ? (
            <>
              <Badge variant="success">В эфире сейчас</Badge>
              <span>
                {liveItem.title}
                {liveItem.room ? ` · Зал «${liveItem.room}»` : ""}
              </span>
            </>
          ) : (
            <span>Сейчас прямых эфиров нет. Ближайшие — в расписании ниже.</span>
          )}
        </div>

        <div className="live-cols">
          <div className="live-main">
            <div className="live-player">
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
              <div className="live-links">
                {links.map((link) => (
                  <a
                    key={link.label}
                    className={buttonClassName("ghost")}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}

            <h2 className="live-schedule-title">Расписание эфиров</h2>
            {items.length === 0 ? (
              <p className="live-now">Расписание эфиров появится после публикации программы.</p>
            ) : (
              <div className="live-schedule">
                {items.map((item) => (
                  <div key={item.id} className="live-item">
                    <div className="live-item-tx">
                      <strong>{item.title}</strong>
                      <span>{formatSlot(item.start_at, item.room)}</span>
                    </div>
                    <Badge variant={item.status.variant}>{item.status.label}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="live-side">
            <div className="live-card">
              <div className="live-tabs" role="tablist" aria-label="Чат и вопросы трансляции">
                <button
                  type="button"
                  className={`live-tab ${tab === "chat" ? "active" : ""}`}
                  aria-pressed={tab === "chat"}
                  onClick={() => setTab("chat")}
                >
                  Чат
                </button>
                <button
                  type="button"
                  className={`live-tab ${tab === "qa" ? "active" : ""}`}
                  aria-pressed={tab === "qa"}
                  onClick={() => setTab("qa")}
                >
                  Q&amp;A
                </button>
              </div>
              <div className="live-card-body">
                {tab === "chat" ? (
                  <>
                    <p>Чат трансляции доступен участникам конференции в личном кабинете.</p>
                    {isAuthorized ? (
                      <Link className={buttonClassName("primary", true)} to="/chat">
                        Открыть чат
                      </Link>
                    ) : (
                      <Link
                        className={buttonClassName("primary", true)}
                        to="/login?next=/chat"
                      >
                        Войти, чтобы участвовать
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <p>Вопросы спикерам модерируются и выводятся на экран в зале.</p>
                    {isAuthorized ? (
                      <Link className={buttonClassName("primary", true)} to="/chat">
                        Перейти к вопросам
                      </Link>
                    ) : (
                      <Link className={buttonClassName("primary", true)} to="/login">
                        Войти, чтобы задать вопрос
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="live-card">
              <div className="live-card-pad">
                <strong>Задать вопрос спикеру</strong>
                <p>Вопросы модерируются и выводятся на экран в зале.</p>
                <Link className={buttonClassName("ghost", true)} to={isAuthorized ? "/chat" : "/login"}>
                  Новый вопрос
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </section>
  );
}
