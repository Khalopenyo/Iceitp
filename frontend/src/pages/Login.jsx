import { useState } from "react";
import { apiPost } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, Field, Input, Button } from "../components/ui/index.jsx";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const statusMessage = typeof location.state?.message === "string" ? location.state.message : "";
  const searchParams = new URLSearchParams(location.search);
  const requestedNext = searchParams.get("next");
  const safeNext = requestedNext && requestedNext.startsWith("/") ? requestedNext : null;

  const submitPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await apiPost("/auth/login", { email, password });
      if (data.user) {
        setUser(data.user);
      }
      navigate(safeNext || "/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Неверные учетные данные");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="auth-card">
      <h1>Вход в систему</h1>
      <p className="auth-sub">Войдите, чтобы открыть личный кабинет конференции.</p>
      {statusMessage ? (
        <div className="auth-status auth-status-success" role="status">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="auth-status auth-status-error" role="alert">
          {errorMessage}
        </div>
      ) : null}
      <form onSubmit={submitPassword}>
        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Пароль" htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <p className="auth-links">
          <Link to="/forgot-password">Забыли пароль?</Link>
        </p>
        <Button type="submit" block disabled={loading}>
          {loading ? "Проверка…" : "Войти"}
        </Button>
      </form>
      <p className="auth-links">
        Нет аккаунта? <Link to="/register">Регистрация</Link>
      </p>
    </Card>
  );
}
