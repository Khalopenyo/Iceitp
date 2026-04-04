import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "../lib/api.js";

const successMessage = "Пароль обновлен. Войдите с новым паролем.";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError("Ссылка восстановления неполная или недействительна.");
      return;
    }
    if (password !== passwordConfirm) {
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

  if (!token) {
    return (
      <section className="panel narrow">
        <h2>Неверная ссылка</h2>
        <p className="form-status error">Токен восстановления не найден. Запросите новую ссылку.</p>
        <div className="form-actions">
          <Link className="btn btn-primary" to="/forgot-password">
            Запросить новую ссылку
          </Link>
          <Link className="btn btn-ghost" to="/login">
            Ко входу
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h2>Новый пароль</h2>
      <p className="muted">Введите новый пароль и повторите его для подтверждения.</p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Новый пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Повторите пароль
          <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required />
        </label>
        {error ? <p className="form-status error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Сохранение..." : "Сохранить пароль"}
        </button>
      </form>
    </section>
  );
}
