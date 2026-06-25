import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "../lib/api.js";
import { Card, Field, Input, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import { EyeButton } from "../components/ui/EyeButton.jsx";
import "./auth.css";

const successMessage = "Пароль обновлён. Войдите с новым паролем.";

function Rule({ ok, children }) {
  return (
    <div className={`auth-rule ${ok ? "ok" : "bad"}`}>
      {ok ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
      <span>{children}</span>
    </div>
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasLength = password.length >= 8;
  const hasUpperDigit = /[A-ZА-ЯЁ]/.test(password) && /\d/.test(password);
  const matches = password.length > 0 && password === passwordConfirm;

  const submit = async (e) => {
    e.preventDefault();
    if (!matches) {
      setError("Пароли не совпадают.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiPost("/auth/reset-password", {
        token,
        password,
        password_confirm: passwordConfirm,
      });
      navigate("/login", { replace: true, state: { message: successMessage } });
    } catch (err) {
      setError(err.message || "Не удалось обновить пароль.");
    } finally {
      setLoading(false);
    }
  };

  // SCR-PUB-10-expired: ссылка отсутствует/недействительна.
  if (!token) {
    return (
      <Card className="auth-card auth-narrow auth-centered">
        <div className="auth-ic auth-ic-warn" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </div>
        <h1>Ссылка устарела</h1>
        <p className="auth-sub">
          Срок действия ссылки для сброса пароля истёк или она уже была использована. Запросите
          новую ссылку.
        </p>
        <div className="auth-actions">
          <Link className={buttonClassName("primary", true)} to="/forgot-password">
            Запросить заново
          </Link>
          <Link className={buttonClassName("ghost", true)} to="/login">
            Вернуться ко входу
          </Link>
        </div>
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
      <h1>Новый пароль</h1>
      <p className="auth-sub">Придумайте надёжный пароль для входа в кабинет.</p>
      <form className="auth-form" onSubmit={submit}>
        <Field label="Новый пароль" htmlFor="reset-password">
          <div className="auth-pw">
            <Input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <EyeButton shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </Field>
        <div className="auth-rules">
          <Rule ok={hasLength}>Не менее 8 символов</Rule>
          <Rule ok={hasUpperDigit}>Заглавная буква и цифра</Rule>
          <Rule ok={matches}>Пароли совпадают</Rule>
        </div>
        <Field label="Повторите пароль" htmlFor="reset-password-confirm">
          <div className="auth-pw">
            <Input
              id="reset-password-confirm"
              type={showPassword ? "text" : "password"}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            <EyeButton shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </Field>
        {error ? (
          <div className="auth-status auth-status-error" role="alert">
            {error}
          </div>
        ) : null}
        <Button type="submit" block disabled={loading || !hasLength || !hasUpperDigit || !matches}>
          {loading ? "Сохранение…" : "Сохранить пароль"}
        </Button>
      </form>
    </Card>
  );
}
