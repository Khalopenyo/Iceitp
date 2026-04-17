import { useState } from "react";
import { apiPost } from "../lib/api.js";
import { setToken } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
      setToken(data.token);
      navigate(safeNext || "/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Неверные учетные данные");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel narrow auth-login-panel">
      <h2>Вход в систему</h2>
      {statusMessage ? <p className="form-status success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}
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
    </section>
  );
}
