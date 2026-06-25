import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../lib/api.js";
import { Card, Field, Input, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./auth.css";

function formatTimer(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function ForgotPassword() {
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((p) => (p > 1 ? p - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiPost("/auth/forgot-password", { email: contact });
      setSentTo(contact);
      setSubmitted(true);
      setCooldown(60);
    } catch (err) {
      setError(err.message || "Не удалось отправить запрос на восстановление пароля.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="auth-card auth-narrow auth-centered">
        <div className="auth-ic" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <h1>Проверьте почту</h1>
        <p className="auth-sub">
          Если аккаунт с таким контактом существует, мы отправили инструкции по восстановлению
          пароля на <b>{sentTo}</b>.
        </p>
        <div className="auth-timer" aria-live="polite">
          {cooldown > 0 ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Отправить ещё раз через {formatTimer(cooldown)}
            </>
          ) : (
            <button
              type="button"
              className={buttonClassName("ghost")}
              onClick={submit}
              disabled={loading}
            >
              {loading ? "Отправка…" : "Отправить ещё раз"}
            </button>
          )}
        </div>
        <Link className={buttonClassName("ghost", true)} to="/login">
          Вернуться ко входу
        </Link>
      </Card>
    );
  }

  return (
    <Card className="auth-card auth-narrow auth-centered">
      <div className="auth-ic" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="15" r="4" />
          <path d="m10.85 12.15 7.65-7.65M16 6l2 2M18 4l2 2" />
        </svg>
      </div>
      <h1>Восстановление пароля</h1>
      <p className="auth-sub">
        Укажите e-mail или телефон — мы отправим ссылку для сброса пароля.
      </p>
      <form className="auth-form" onSubmit={submit}>
        <Field label="E-mail или телефон" htmlFor="forgot-contact">
          <Input
            id="forgot-contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        {error ? (
          <div className="auth-status auth-status-error" role="alert">
            {error}
          </div>
        ) : null}
        <Button type="submit" block disabled={loading}>
          {loading ? "Отправка…" : "Отправить ссылку"}
        </Button>
      </form>
      <p className="auth-links auth-links-center">
        Вспомнили пароль? <Link to="/login">Войти</Link>
      </p>
    </Card>
  );
}
