import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import "./event.css";

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
const formatLabel = (userType) => (userType === "online" ? "онлайн" : "офлайн");

// EventSectionDetail — деталь секции в зоне EventShell: шапка + раскрывающиеся доклады.
export default function EventSectionDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTalk, setOpenTalk] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await apiGet(`/sections/${encodeURIComponent(id)}`);
        if (!active) return;
        setData(response);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err.message || "Секция не найдена.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id]);

  const section = data?.section || null;
  const talks = data?.talks || [];

  return (
    <div className="ev-page" data-screen-label="Секция">
      <div className="ev-crumbs">
        <Link to="/sections">← Секции</Link>
        {section?.title ? ` › ${section.title}` : ""}
      </div>

      {loading ? (
        <p className="ev-empty">Загружаю секцию…</p>
      ) : error || !section ? (
        <p className="ev-empty">{error || "Секция не найдена."}</p>
      ) : (
        <>
          <h1 className="ev-page-h">{section.title}</h1>
          {section.chair ? (
            <p className="ev-page-sub" style={{ margin: "0 0 0" }}>
              Председатель: <strong>{section.chair}</strong>
            </p>
          ) : null}
          <div className="ev-detail-meta">
            {section.start_at ? <span>{formatDate(section.start_at)}</span> : null}
            {section.start_at ? (
              <span>
                {formatTime(section.start_at)}
                {section.end_at ? `–${formatTime(section.end_at)}` : ""}
              </span>
            ) : null}
            {section.room ? <span>Зал «{section.room}»</span> : null}
          </div>
          {section.description ? <p className="ev-detail-desc">{section.description}</p> : null}

          <div className="ev-subhead">
            <h2>
              Доклады секции <span>· {talks.length}</span>
            </h2>
            <Link className="ev-card-link" to="/program">
              Смотреть в программе →
            </Link>
          </div>

          {talks.length === 0 ? (
            <p className="ev-empty">
              Доклады секции публикуются организаторами по мере утверждения программы.
            </p>
          ) : (
            <div className="ev-talks">
              {talks.map((talk, index) => {
                const isOpen = openTalk === index;
                const hasDetail = Boolean(talk.abstract) || (talk.user_type === "online" && talk.join_url);
                return (
                  <article key={index} className={`ev-talk ${isOpen ? "open" : ""}`}>
                    <button
                      type="button"
                      className="ev-talk-btn"
                      aria-expanded={isOpen}
                      onClick={() => setOpenTalk(isOpen ? null : index)}
                    >
                      <div className="ev-talk-main">
                        <strong>
                          {talk.starts_at ? `${formatTime(talk.starts_at)} · ` : ""}
                          {talk.talk_title}
                        </strong>
                        <div className="ev-talk-author">
                          {talk.author_name || "Докладчик"}
                          {talk.organization ? ` · ${talk.organization}` : ""}
                          {` · ${formatLabel(talk.user_type)}`}
                        </div>
                      </div>
                      {hasDetail ? (
                        <span className="ev-talk-chev" aria-hidden="true">
                          ›
                        </span>
                      ) : null}
                    </button>
                    {isOpen && hasDetail ? (
                      <div className="ev-talk-detail">
                        {talk.abstract ? <p style={{ margin: 0 }}>Аннотация: {talk.abstract}</p> : null}
                        {talk.user_type === "online" && talk.join_url ? (
                          <a
                            className="ev-card-link"
                            href={talk.join_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-block", marginTop: 10 }}
                          >
                            Ссылка на трансляцию →
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          <div className="ev-banner">
            <span>Хотите выступить в этой секции? Подайте доклад при регистрации.</span>
            <Link className="ev-btn-sm primary" to="/register">
              Регистрация
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
