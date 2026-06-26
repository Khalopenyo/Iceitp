import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import { getConferenceTitle, formatConferenceDateRange } from "../../lib/conference.js";
import "./event.css";

const FORMAT_LABEL = { hybrid: "Очно и онлайн", offline: "Только очно", online: "Только онлайн" };

export default function EventLanding() {
  const navigate = useNavigate();
  const { conference, org } = useOutletContext();
  const [landing, setLanding] = useState(null);

  useEffect(() => {
    apiGet("/landing").then(setLanding).catch(() => setLanding(null));
  }, []);

  const stats = landing?.stats || {};
  const sections = landing?.sections || [];
  const title = getConferenceTitle(conference);
  const dateLabel = conference?.starts_at ? formatConferenceDateRange(conference.starts_at, conference.ends_at) : "";
  const formatLabel = FORMAT_LABEL[conference?.format] || "";
  const registrationOpen = conference?.status === "live";

  const figures = [
    { v: stats.participants ?? 0, l: "участников" },
    { v: stats.talks ?? 0, l: "докладов" },
    { v: stats.sections ?? 0, l: "секций" },
    { v: stats.cities ?? 0, l: "городов" },
  ];

  return (
    <div data-screen-label="Главная">
      {/* Hero */}
      <section className="ev-hero">
        <div className="ev-eyebrow">Научно-практическая конференция</div>
        <h1 className="ev-h1">{title}</h1>
        <div className="ev-chips">
          {dateLabel ? <span className="ev-chip">{dateLabel}</span> : null}
          {conference?.venue_address ? <span className="ev-chip">{conference.venue_address.split(",")[0]}</span> : (org?.display_name ? <span className="ev-chip">{org.display_name}</span> : null)}
          {formatLabel ? <span className="ev-chip">{formatLabel}</span> : null}
          {(stats.sections ?? 0) > 0 ? <span className="ev-chip accent">{stats.sections} секций</span> : null}
        </div>
        {conference?.description ? <p className="ev-lead">{conference.description}</p> : null}
        <div className="ev-cta">
          <button
            className="ev-btn"
            disabled={!registrationOpen}
            onClick={() => navigate("/register")}
          >
            {registrationOpen ? "Зарегистрироваться" : "Регистрация закрыта"}
          </button>
          <Link className="ev-btn-ghost" to="/program">Смотреть программу</Link>
        </div>
      </section>

      {/* Ключевые цифры */}
      <section className="ev-section">
        <div className="ev-section-eyebrow">Конференция в цифрах</div>
        <div className="ev-grid-4">
          {figures.map((f) => (
            <div className="ev-card" key={f.l}>
              <div className="ev-stat-val">{f.v}</div>
              <div className="ev-stat-label">{f.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Об организаторах */}
      <section className="ev-section" style={{ paddingTop: 0 }}>
        <div className="ev-section-eyebrow">Об организаторе</div>
        <div className="ev-grid-3">
          <div className="ev-card">
            <div className="ev-card-h">{org?.display_name || "Вуз-организатор"}</div>
            <p className="ev-card-p">Площадка и организатор конференции. Сопровождение участников от подачи заявки до сборника трудов.</p>
          </div>
          <div className="ev-card">
            <div className="ev-card-h">Формат</div>
            <p className="ev-card-p">{formatLabel || "Очное и онлайн участие"}{dateLabel ? ` · ${dateLabel}` : ""}. {conference?.venue_address || ""}</p>
          </div>
          <div className="ev-card">
            <div className="ev-card-h">Участие</div>
            <p className="ev-card-p">Регистрация, личный кабинет, программа по секциям, навигация по площадке, чат и итоговые документы.</p>
          </div>
        </div>
      </section>

      {/* Секции */}
      {sections.length ? (
        <section className="ev-section" style={{ paddingTop: 0 }}>
          <div className="ev-section-eyebrow">Секции конференции</div>
          {sections.slice(0, 8).map((s, i) => (
            <Link className="ev-sec-row" to={`/sections/${s.id}`} key={s.id}>
              <span className="ev-sec-code">С{i + 1}</span>
              <span className="ev-sec-title">{s.title}</span>
              <span className="ev-sec-meta">{s.room || "зал уточняется"}</span>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
