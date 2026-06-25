import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "./ui/index.jsx";
import "../pages/status-page.css";

// Заглушки состояний публичного сайта конференции (SCR-PUB-15):
// not-published — конференция ещё не опубликована;
// finished — конференция завершена (доступ к материалам);
// suspended — тенант приостановлен.
export default function StatusPlaceholder({ variant, title, dateLabel, supportEmail }) {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  if (variant === "finished") {
    return (
      <section className="status-page">
        <div className="status-ic status-ic-ok" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="m8.5 12 2.5 2.5 4.5-5" />
          </svg>
        </div>
        <h1>Конференция завершена</h1>
        <p>
          Благодарим за участие{title ? ` в конференции «${title}»` : ""}. Доступны итоговые
          материалы и сборник трудов.
        </p>
        <div className="status-materials">
          <Link className="status-material" to="/program">
            <span className="status-material-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h6" />
              </svg>
            </span>
            Программа PDF
          </Link>
          <Link className="status-material" to="/program">
            <span className="status-material-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </span>
            Сборник трудов
          </Link>
          <Link className="status-material" to="/verify">
            <span className="status-material-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="9" r="5" />
                <path d="m8.5 13-1.5 8 5-3 5 3-1.5-8" />
              </svg>
            </span>
            Проверить сертификат
          </Link>
        </div>
      </section>
    );
  }

  if (variant === "suspended") {
    const mail = supportEmail || "support@platform.ru";
    return (
      <section className="status-page">
        <div className="status-ic status-ic-danger" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="m5.6 5.6 12.8 12.8" />
          </svg>
        </div>
        <h1>Сайт временно недоступен</h1>
        <p>
          Доступ к этому сайту приостановлен. Если вы организатор, свяжитесь со службой поддержки
          платформы.
        </p>
        <div className="status-actions">
          <a className="status-material" style={{ flexDirection: "row", padding: "10px 16px" }} href={`mailto:${mail}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            {mail}
          </a>
        </div>
      </section>
    );
  }

  // not-published (по умолчанию)
  return (
    <section className="status-page">
      <div className="status-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </div>
      <h1>Сайт конференции скоро откроется</h1>
      <p>
        {title ? `Конференция «${title}»` : "Конференция"}
        {dateLabel ? ` состоится ${dateLabel}` : ""}. Регистрация откроется позже — оставьте
        контакт, и мы сообщим о старте.
      </p>
      {subscribed ? (
        <p className="status-note" role="status">
          Спасибо! Мы сообщим о старте на {email}.
        </p>
      ) : (
        <form
          className="status-subscribe"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setSubscribed(true);
          }}
        >
          <span className="status-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ваш e-mail"
              aria-label="E-mail для уведомления о старте"
              required
            />
          </span>
          <Button type="submit">Сообщить</Button>
        </form>
      )}
    </section>
  );
}
