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
import { Container, Button, Badge } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./landing.css";

// Generic, product-level features (the same for every tenant — describe the
// platform, not a specific university). Tenant-specific content lives in CMS blocks.
const platformFeatures = [
  { code: "01", title: "Выбор секций", text: "Подача заявки с выбором секции и темы доклада в единой форме регистрации." },
  { code: "02", title: "Бейджи и сертификаты", text: "Персональные документы участника формируются автоматически в личном кабинете." },
  { code: "03", title: "Чат участников", text: "Общение, вопросы и обмен файлами внутри платформы без сторонних сервисов." },
  { code: "04", title: "Электронный сборник", text: "После конференции участник получает доступ к итоговым материалам и публикациям." },
];

export default function Welcome() {
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const conference = outletContext.conference || null;
  const isAuthorized = isAuthenticated();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [blocks, setBlocks] = useState([]);

  useEffect(() => {
    fetchContentBlocks().then((list) => setBlocks(list));
  }, []);

  const conferenceTitle = getConferenceTitle(conference);
  const conferenceDescription = getConferenceDescription(conference);
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
    <div className="pub-landing">
      <section className="pub-hero">
        <Container className="pub-hero-inner">
          <p className="pub-kicker">Научно-практическая конференция</p>
          <h1 className="pub-hero-title">{conferenceTitle}</h1>
          <p className="pub-hero-meta">
            {conferenceDateLabel ? <strong>{conferenceDateLabel}</strong> : null}
            <span>Онлайн и офлайн участие</span>
            {conferenceStatusLabel ? <Badge variant="brand">{conferenceStatusLabel}</Badge> : null}
          </p>
          {conferenceDescription ? <p className="pub-hero-desc">{conferenceDescription}</p> : null}
          <div className="pub-hero-actions">
            {isAuthorized ? (
              <Link className={buttonClassName("primary")} to="/dashboard">
                Личный кабинет
              </Link>
            ) : (
              <>
                <Button onClick={() => startRegistration("offline")}>Регистрация</Button>
                <Link className={buttonClassName("ghost")} to="/login">
                  Войти
                </Link>
              </>
            )}
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

      <section className="pub-features">
        <Container>
          <div className="pub-section-head">
            <Badge variant="brand">Возможности платформы</Badge>
            <h2>Что ждёт участника в личном кабинете</h2>
          </div>
          <div className="pub-feature-grid">
            {platformFeatures.map((feature) => (
              <article key={feature.code} className="pub-feature-card">
                <span className="pub-feature-code">{feature.code}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {!isAuthorized ? (
        <section className="pub-register">
          <Container>
            <Badge variant="brand">Регистрация</Badge>
            <h2>Подайте заявку на участие</h2>
            <p className="pub-register-copy">
              Выберите формат участия, подтвердите согласие на обработку и размещение персональных данных и перейдите к
              регистрационной форме.
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
