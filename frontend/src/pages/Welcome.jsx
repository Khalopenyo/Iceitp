import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { isAuthenticated } from "../lib/auth.js";
import {
  formatConferenceDateRange,
  getConferenceDescription,
  getConferenceStatusLabel,
  getConferenceTitle,
} from "../lib/conference.js";
import { fetchContentBlocks } from "../lib/content.js";
import { fetchLanding } from "../lib/landing.js";
import { Container, Button, Badge } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import StatusPlaceholder from "../components/StatusPlaceholder.jsx";
import "./landing.css";

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!target) {
    return null;
  }
  const ms = new Date(target).getTime() - now;
  if (Number.isNaN(ms)) {
    return null;
  }
  if (ms <= 0) {
    return { started: true, days: 0, hours: 0, mins: 0, secs: 0 };
  }
  return {
    started: false,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
    secs: Math.floor((ms % 60000) / 1000),
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatSessionTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Welcome() {
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const conference = outletContext.conference || null;
  const conferenceLoaded = Boolean(outletContext.conferenceLoaded);
  const isAuthorized = isAuthenticated();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [landing, setLanding] = useState(null);

  useEffect(() => {
    fetchContentBlocks().then((list) => setBlocks(list));
  }, []);

  useEffect(() => {
    fetchLanding().then((data) => setLanding(data));
  }, []);

  const conferenceTitle = getConferenceTitle(conference);
  const conferenceDescription = getConferenceDescription(conference);
  const conferenceDateLabel =
    outletContext.conferenceDateLabel || formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const conferenceStatusLabel =
    outletContext.conferenceStatusLabel || getConferenceStatusLabel(conference?.status);
  const countdown = useCountdown(conference?.starts_at);
  const stats = landing?.stats || null;
  const sections = landing?.sections || [];
  const programPreview = landing?.program_preview || [];
  const registrationOpen = conference?.status === "draft" || conference?.status === "live";

  const startRegistration = (mode) => {
    if (!consentAccepted) {
      setConsentError("Сначала подтвердите согласие на обработку и размещение персональных данных.");
      return;
    }
    setConsentError("");
    navigate(`/register?mode=${mode}`);
  };

  // Заглушки состояний (SCR-PUB-15). Перехватываем лендинг до показа витрины.
  if (conferenceLoaded && !conference) {
    return <StatusPlaceholder variant="not-published" />;
  }
  if (conference?.status === "finished") {
    return (
      <StatusPlaceholder variant="finished" title={conferenceTitle} dateLabel={conferenceDateLabel} />
    );
  }

  return (
    <div className="pub-landing">
      <section className="pub-hero">
        <Container className="pub-hero-inner">
          <p className="pub-kicker">Научно-практическая конференция</p>
          {conferenceLoaded ? (
            <>
              <h1 className="pub-hero-title">{conferenceTitle}</h1>
              <p className="pub-hero-meta">
                {conferenceDateLabel ? <strong>{conferenceDateLabel}</strong> : null}
                <span>Онлайн и офлайн участие</span>
                {conferenceStatusLabel ? <Badge variant="brand">{conferenceStatusLabel}</Badge> : null}
              </p>
              {conferenceDescription ? <p className="pub-hero-desc">{conferenceDescription}</p> : null}
            </>
          ) : (
            <div className="pub-hero-skeleton" aria-hidden="true">
              <span className="pub-skel pub-skel-title" />
              <span className="pub-skel pub-skel-meta" />
            </div>
          )}
          <div className="pub-hero-actions">
            {isAuthorized ? (
              <Link className={buttonClassName("primary")} to="/dashboard">
                Личный кабинет
              </Link>
            ) : (
              <>
                <Button onClick={() => startRegistration("offline")}>Зарегистрироваться</Button>
                <Link className={buttonClassName("ghost")} to="/program">
                  Программа
                </Link>
              </>
            )}
          </div>

          {countdown && !countdown.started ? (
            <div className="pub-countdown" aria-label="Обратный отсчёт до открытия">
              <div className="pub-cd">
                <b>{countdown.days}</b>
                <span>дней</span>
              </div>
              <div className="pub-cd">
                <b>{pad(countdown.hours)}</b>
                <span>часов</span>
              </div>
              <div className="pub-cd">
                <b>{pad(countdown.mins)}</b>
                <span>минут</span>
              </div>
              <div className="pub-cd">
                <b>{pad(countdown.secs)}</b>
                <span>секунд</span>
              </div>
            </div>
          ) : null}
        </Container>
      </section>

      {stats ? (
        <section className="pub-section">
          <Container>
            <h2 className="pub-block-title">Ключевые цифры</h2>
            <div className="pub-stats">
              <div className="pub-stat">
                <b>{stats.sections}</b>
                <span>Секции</span>
              </div>
              <div className="pub-stat">
                <b>{stats.talks}</b>
                <span>Доклады</span>
              </div>
              <div className="pub-stat">
                <b>{stats.participants}</b>
                <span>Участники</span>
              </div>
              <div className="pub-stat">
                <b>{stats.cities}</b>
                <span>Города</span>
              </div>
            </div>
          </Container>
        </section>
      ) : null}

      <section className="pub-section">
        <Container>
          <h2 className="pub-block-title">Важные даты</h2>
          <div className="pub-dates">
            <div className="pub-date">
              <div className="pub-date-tx">
                <strong>Регистрация участников</strong>
                <span>Подача заявок на участие и доклады</span>
              </div>
              <Badge variant={registrationOpen ? "success" : "neutral"}>
                {registrationOpen ? "Открыта" : "Закрыта"}
              </Badge>
            </div>
            {conferenceDateLabel ? (
              <div className="pub-date">
                <div className="pub-date-tx">
                  <strong>Даты проведения</strong>
                  <span>{conferenceDateLabel}</span>
                </div>
                <Badge variant="brand">Основное</Badge>
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      {blocks.length > 0 ? (
        <Container>
          {blocks.map((block) => (
            <section key={block.id} id={block.kind} className="pub-block">
              {block.title ? <h2 className="pub-block-title">{block.title}</h2> : null}
              {block.body ? (
                <div className="pub-block-body">
                  {block.body
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              ) : null}
            </section>
          ))}
        </Container>
      ) : null}

      {programPreview.length > 0 ? (
        <section className="pub-section" id="program">
          <Container>
            <div className="pub-section-head-row">
              <h2 className="pub-block-title">Превью программы</h2>
              <Link className={buttonClassName("ghost")} to="/program">
                Полная программа
              </Link>
            </div>
            <div className="pub-prog-list">
              {programPreview.map((item) => (
                <div key={item.id} className="pub-prog-item">
                  <div className="pub-prog-tx">
                    <strong>{item.title}</strong>
                    <span>
                      {formatSessionTime(item.start_at)}
                      {item.room ? ` · Зал «${item.room}»` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {sections.length > 0 ? (
        <section className="pub-section" id="sections">
          <Container>
            <div className="pub-section-head-row">
              <h2 className="pub-block-title">Секции</h2>
              <Link className={buttonClassName("ghost")} to="/sections">
                Все секции
              </Link>
            </div>
            <div className="pub-section-cards">
              {sections.map((section) => (
                <article key={section.id} className="pub-section-card">
                  <strong>{section.title}</strong>
                  {section.description ? <p>{section.description}</p> : null}
                  <div className="pub-section-card-meta">
                    {section.room ? <span>Зал «{section.room}»</span> : null}
                    <span>{section.talks_count} докл.</span>
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <section className="pub-section" id="venue">
        <Container>
          <div className="pub-venue">
            <div className="pub-venue-col">
              <h2 className="pub-block-title">Место проведения</h2>
              <p className="pub-venue-text">
                Точный адрес площадки и схема проезда публикуются организатором. Очным участникам
                доступен интерактивный 360-тур по площадке.
              </p>
              <div className="pub-hero-actions">
                <Link className={buttonClassName("ghost")} to="/map">
                  360-тур по площадке
                </Link>
              </div>
            </div>
            <div className="pub-venue-col" id="contacts">
              <h2 className="pub-block-title">Контакты оргкомитета</h2>
              {outletContext.conferenceSupportEmail ? (
                <p className="pub-venue-text">
                  Email:{" "}
                  <a href={`mailto:${outletContext.conferenceSupportEmail}`}>
                    {outletContext.conferenceSupportEmail}
                  </a>
                </p>
              ) : (
                <p className="pub-venue-text">Контакты организатора публикуются на странице конференции.</p>
              )}
            </div>
          </div>
        </Container>
      </section>

      {!isAuthorized ? (
        <section className="pub-register">
          <Container>
            <Badge variant="brand">Регистрация</Badge>
            <h2>Подайте заявку на участие</h2>
            <p className="pub-register-copy">
              Выберите формат участия, подтвердите согласие на обработку и размещение персональных данных и
              перейдите к регистрационной форме.
            </p>
            <div className="pub-hero-actions">
              <Button onClick={() => startRegistration("offline")}>Офлайн-участник</Button>
              <Button variant="ghost" onClick={() => startRegistration("online")}>
                Онлайн-участник
              </Button>
            </div>
            <label className="pub-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => {
                  setConsentAccepted(event.target.checked);
                  if (event.target.checked) setConsentError("");
                }}
              />
              <span>
                Согласие на обработку и размещение персональных данных. Полный текст:{" "}
                <Link to="/personal-data">официальный документ</Link>.
              </span>
            </label>
            {consentError ? (
              <p className="pub-form-error" role="alert">
                {consentError}
              </p>
            ) : null}
          </Container>
        </section>
      ) : null}
    </div>
  );
}
