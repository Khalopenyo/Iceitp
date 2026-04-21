import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { isAuthenticated } from "../lib/auth.js";
import {
  formatConferenceDateRange,
  getConferenceDescription,
  getConferenceStatusLabel,
  getConferenceSupportEmail,
  getConferenceTitle,
} from "../lib/conference.js";

const organizerCards = [
  {
    id: "university",
    label: "О вузе",
    title: "ГГНТУ",
    text:
      "Грозненский государственный нефтяной технический университет имени академика М.Д. Миллионщикова выступает основной площадкой конференции и отвечает за очную программу, секции и организационный контур мероприятия.",
  },
  {
    id: "iceitp",
    label: "Об ИЦЭиТП",
    title: "Институт цифровой экономики и технологического предпринимательства",
    text:
      "ИЦЭиТП координирует цифровую повестку конференции, работу с участниками, сбор материалов, сопровождение публикаций и единый пользовательский путь от регистрации до итоговых документов.",
  },
];

const platformFeatures = [
  {
    code: "01",
    title: "Выбор секций",
    text: "Подача заявки с выбором подходящей секции и темы доклада внутри единой формы регистрации.",
  },
  {
    code: "02",
    title: "Бейджи и сертификаты",
    text: "Персональные документы участника формируются автоматически и доступны в личном кабинете.",
  },
  {
    code: "03",
    title: "Чат участников",
    text: "Общение, вопросы и обмен файлами внутри платформы без перехода в сторонние сервисы.",
  },
  {
    code: "04",
    title: "Электронный сборник",
    text: "После завершения конференции участник получает доступ к итоговым материалам и публикациям.",
  },
];

const conferenceHighlights = [
  "Офлайн и онлайн-формат",
  "5 тематических секций",
  "РИНЦ / eLIBRARY",
  "Лучшие статьи для ВАК (К-3)",
];

export default function Welcome() {
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const conference = outletContext.conference || null;
  const isAuthorized = isAuthenticated();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState("");

  const conferenceTitle = getConferenceTitle(conference);
  const conferenceDescription = getConferenceDescription(conference);
  const conferenceSupportEmail = outletContext.conferenceSupportEmail || getConferenceSupportEmail(conference);
  const conferenceDateLabel =
    outletContext.conferenceDateLabel || formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const conferenceStatusLabel =
    outletContext.conferenceStatusLabel || getConferenceStatusLabel(conference?.status);

  const startRegistration = (mode) => {
    if (!consentAccepted) {
      setConsentError("Сначала подтвердите согласие на обработку и размещение персональных данных.");
      return;
    }

    setConsentError("");
    navigate(`/register?mode=${mode}`);
  };

  return (
    <div className="landing-v2">
      <section className="landing-v2-hero">
        <div className="landing-v2-hero-copy">
          <p className="landing-v2-kicker">Всероссийская научно-практическая конференция с международным участием</p>
          <h1>{conferenceTitle}</h1>
          <p className="landing-v2-meta">
            <strong>{conferenceDateLabel || "24-25 апреля 2026"}</strong>
            <span>Онлайн и оффлайн участие</span>
            {conferenceStatusLabel ? <span>{conferenceStatusLabel}</span> : null}
          </p>
          <p className="landing-v2-description">{conferenceDescription}</p>
          <div className="landing-v2-highlight-list">
            {conferenceHighlights.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="landing-v2-hero-actions">
            {isAuthorized ? (
              <Link className="btn btn-primary" to="/dashboard">
                Открыть личный кабинет
              </Link>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={() => startRegistration("offline")}>
                  Подать заявку
                </button>
                <Link className="btn btn-ghost" to="/login">
                  Войти
                </Link>
              </>
            )}
          </div>
        </div>

        <aside className="landing-v2-hero-panel" aria-label="Краткая информация о мероприятии">
          <div className="landing-v2-panel-card">
            <span>Формат участия</span>
            <strong>Онлайн / Оффлайн</strong>
            <p>Участник сам выбирает удобный формат при регистрации, а программа и документы формируются автоматически.</p>
          </div>
          <div className="landing-v2-panel-card">
            <span>Что получает участник</span>
            <strong>Программу, бейдж, сертификат, сборник</strong>
            <p>Все основные действия и материалы доступны в личном кабинете без разрозненных каналов связи.</p>
          </div>
        </aside>
      </section>

      <section id="conference" className="landing-v2-section">
        <div className="landing-v2-section-head">
          <span className="badge">О конференции</span>
          <h2>Знакомство с мероприятием до регистрации</h2>
        </div>
        <div className="landing-v2-conference-text">
          <p>{conferenceDescription}</p>
          <p>
            Платформа ведет участника по полному маршруту: регистрация, выбор формата участия, секция и тема доклада,
            доступ к программе, документам, чату, обратной связи и итоговому сборнику материалов.
          </p>
        </div>
      </section>

      <section className="landing-v2-section">
        <div className="landing-v2-section-head">
          <span className="badge">Организаторы</span>
          <h2>Кто проводит конференцию</h2>
        </div>
        <div className="landing-v2-organizer-grid">
          {organizerCards.map((card) => (
            <article key={card.id} id={card.id} className="landing-v2-organizer-card">
              <div className="landing-v2-organizer-mark">{card.label}</div>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-v2-section">
        <div className="landing-v2-section-head">
          <span className="badge">Возможности платформы</span>
          <h2>Что ждет участника внутри личного кабинета</h2>
        </div>
        <div className="landing-v2-feature-grid">
          {platformFeatures.map((feature) => (
            <article key={feature.code} className="landing-v2-feature-card">
              <span className="landing-v2-feature-code">{feature.code}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-v2-section landing-v2-register" aria-labelledby="landing-register-title">
        <div className="landing-v2-section-head">
          <span className="badge">Регистрация</span>
          <h2 id="landing-register-title">Старт регистрации без лишних шагов</h2>
        </div>
        <p className="landing-v2-register-copy">
          Выберите формат участия, подтвердите согласие на обработку и размещение персональных данных и перейдите к полной
          регистрационной форме.
        </p>

        {isAuthorized ? (
          <div className="landing-v2-register-actions">
            <Link className="btn btn-primary" to="/dashboard">
              Перейти в личный кабинет
            </Link>
          </div>
        ) : (
          <>
            <div className="landing-v2-register-actions">
              <button type="button" className="btn btn-primary" onClick={() => startRegistration("offline")}>
                Оффлайн-участник
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => startRegistration("online")}>
                Онлайн-участник
              </button>
            </div>

            <label className="landing-v2-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => {
                  setConsentAccepted(event.target.checked);
                  if (event.target.checked) {
                    setConsentError("");
                  }
                }}
              />
              <span>
                Согласие на обработку и размещение персональных данных. Полный текст:
                {" "}
                <Link to="/personal-data">официальный документ</Link>.
              </span>
            </label>
            {consentError ? <p className="form-status error">{consentError}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}
