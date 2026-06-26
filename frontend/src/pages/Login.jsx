import { useState } from "react";
import { apiPost } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, Field, Input, Button } from "../components/ui/index.jsx";
import { EyeButton } from "../components/ui/EyeButton.jsx";
import "./auth.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      // Оператор → операторская консоль; организатор/админ/команда → консоль вуза;
      // участник → личный кабинет.
      const role = data.user?.role;
      const home = role === "operator" ? "/ops" : ["admin", "org", "staff"].includes(role) ? "/console" : "/dashboard";
      navigate(safeNext || home);
    } catch (err) {
      setErrorMessage(err.message || "Неверный логин или пароль. Проверьте данные и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="auth-card auth-narrow auth-centered">
      <h1>Вход</h1>
      <p className="auth-sub">в личный кабинет участника</p>
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
      <form className="auth-form" onSubmit={submitPassword}>
        <Field label="E-mail или телефон" htmlFor="login-email">
          <Input
            id="login-email"
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Пароль" htmlFor="login-password">
          <div className="auth-pw">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <EyeButton shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </Field>
        <p className="auth-links auth-links-right">
          <Link to="/forgot-password">Забыли пароль?</Link>
        </p>
        <Button type="submit" block disabled={loading}>
          {loading ? "Проверка…" : "Войти"}
        </Button>
      </form>
      <div className="auth-sep">
        <span>или</span>
      </div>
      <button type="button" className="auth-esia" disabled aria-disabled="true">
        Войти через Госуслуги (ЕСИА)
        <em>скоро</em>
      </button>
      <p className="auth-links auth-links-center">
        Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
      </p>
      <p className="auth-links auth-links-center auth-links-muted">
        Организуете конференцию? <Link to="/console/signup">Создать рабочее пространство</Link>
      </p>
    </Card>
  );
}
