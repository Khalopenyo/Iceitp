import { useEffect, useState } from "react";
import { apiPost } from "../lib/api.js";
import { setToken } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [method, setMethod] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [phoneStatusMessage, setPhoneStatusMessage] = useState("");
  const statusMessage = typeof location.state?.message === "string" ? location.state.message : "";
  const searchParams = new URLSearchParams(location.search);
  const requestedNext = searchParams.get("next");
  const safeNext = requestedNext && requestedNext.startsWith("/") ? requestedNext : null;

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const submitPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await apiPost("/auth/login", { email, password });
      setToken(data.token);
      navigate(safeNext || "/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Неверные учетные данные");
    } finally {
      setLoading(false);
    }
  };

  const requestPhoneCode = async () => {
    setRequestingCode(true);
    setErrorMessage("");
    setPhoneStatusMessage("");
    try {
      const data = await apiPost("/auth/phone-code/request", { phone });
      setPhoneStatusMessage(data.message || "Код отправлен по SMS");
      setCooldown(Number(data.cooldown_seconds) || 60);
    } catch (err) {
      setErrorMessage(err.message || "Не удалось отправить код");
    } finally {
      setRequestingCode(false);
    }
  };

  const submitPhoneCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await apiPost("/auth/phone-code/verify", { phone, code });
      setToken(data.token);
      navigate(safeNext || "/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Неверный код подтверждения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel narrow auth-login-panel">
      <h2>Вход в систему</h2>
      {statusMessage ? <p className="form-status success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}
      <div className="auth-method-switch" role="tablist" aria-label="Способ входа">
        <button
          type="button"
          className={`btn ${method === "password" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => {
            setMethod("password");
            setErrorMessage("");
          }}
        >
          По паролю
        </button>
        <button
          type="button"
          className={`btn ${method === "phone" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => {
            setMethod("phone");
            setErrorMessage("");
          }}
        >
          По коду
        </button>
      </div>

      {method === "password" ? (
        <form className="form-grid" onSubmit={submitPassword}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Пароль
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <p className="muted">
            <Link to="/forgot-password">Забыли пароль?</Link>
          </p>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Проверка..." : "Войти"}
          </button>
        </form>
      ) : (
        <form className="form-grid" onSubmit={submitPhoneCode}>
          {phoneStatusMessage ? <p className="form-status info">{phoneStatusMessage}</p> : null}
          <label>
            Телефон
            <input
              type="tel"
              inputMode="tel"
              placeholder="+7 999 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <div className="auth-inline-actions">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={requestPhoneCode}
              disabled={requestingCode || cooldown > 0 || !phone.trim()}
            >
              {requestingCode ? "Отправка..." : cooldown > 0 ? `Повтор через ${cooldown}с` : "Отправить код"}
            </button>
          </div>
          <label>
            Код подтверждения
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="5 цифр"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <p className="muted">Используйте номер телефона, указанный в анкете участника.</p>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Проверка..." : "Войти по коду"}
          </button>
        </form>
      )}
    </section>
  );
}
