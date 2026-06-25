import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { Container, Badge } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./section-detail.css";

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

const formatLabel = (userType) => (userType === "online" ? "онлайн" : "офлайн");

export default function SectionDetail() {
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
    <section className="secd">
      <Container>
        <div className="secd-crumbs">
          <Link to="/sections">← Секции</Link>
          {section?.title ? ` › ${section.title}` : ""}
        </div>

        {loading ? (
          <p className="secd-empty">Загружаю секцию…</p>
        ) : error || !section ? (
          <p className="secd-empty">{error || "Секция не найдена."}</p>
        ) : (
          <>
            <div className="secd-header">
              <h1>{section.title}</h1>
              {section.chair ? (
                <div className="secd-meta">
                  <span>
                    Председатель: <strong>{section.chair}</strong>
                  </span>
                </div>
              ) : null}
              <div className="secd-meta">
                {section.start_at ? <span>{formatDate(section.start_at)}</span> : null}
                {section.start_at ? (
                  <span>
                    {formatTime(section.start_at)}
                    {section.end_at ? `–${formatTime(section.end_at)}` : ""}
                  </span>
                ) : null}
                {section.room ? <span>Зал «{section.room}»</span> : null}
              </div>
              {section.description ? <p className="secd-desc">{section.description}</p> : null}
            </div>

            <div className="secd-talks-head">
              <h2>
                Доклады секции <span>· {talks.length}</span>
              </h2>
              <Link className={buttonClassName("ghost")} to="/program">
                Смотреть в программе
              </Link>
            </div>

            {talks.length === 0 ? (
              <p className="secd-empty">
                Доклады секции публикуются организаторами по мере утверждения программы.
              </p>
            ) : (
              <div className="secd-talks">
                {talks.map((talk, index) => {
                  const isOpen = openTalk === index;
                  const hasDetail = Boolean(talk.abstract) || (talk.user_type === "online" && talk.join_url);
                  return (
                    <article key={index} className={`secd-talk ${isOpen ? "open" : ""}`}>
                      <button
                        type="button"
                        className="secd-talk-btn"
                        aria-expanded={isOpen}
                        onClick={() => setOpenTalk(isOpen ? null : index)}
                      >
                        <div className="secd-talk-main">
                          <strong>
                            {talk.starts_at ? `${formatTime(talk.starts_at)} · ` : ""}
                            {talk.talk_title}
                          </strong>
                          <div className="secd-talk-author">
                            {talk.author_name || "Докладчик"}
                            {talk.organization ? ` · ${talk.organization}` : ""}
                            {` · ${formatLabel(talk.user_type)}`}
                          </div>
                        </div>
                        {hasDetail ? (
                          <span className="secd-talk-chev" aria-hidden="true">
                            ›
                          </span>
                        ) : null}
                      </button>
                      {isOpen && hasDetail ? (
                        <div className="secd-talk-detail">
                          {talk.abstract ? <p>Аннотация: {talk.abstract}</p> : null}
                          {talk.user_type === "online" && talk.join_url ? (
                            <div className="secd-talk-join">
                              <a
                                className={buttonClassName("ghost")}
                                href={talk.join_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Ссылка на трансляцию
                              </a>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="secd-banner">
              <span>Хотите выступить в этой секции? Подайте доклад при регистрации.</span>
              <Link className={buttonClassName("primary")} to="/register">
                Регистрация
              </Link>
            </div>
          </>
        )}
      </Container>
    </section>
  );
}
