import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "../lib/api.js";
import { Card, Field, Input, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";

const successMessage = "Пароль обновлён. Войдите с новым паролем.";

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
      <Card className="auth-card">
        <h1>Неверная ссылка</h1>
        <div className="auth-status auth-status-error">Токен восстановления не найден. Запросите новую ссылку.</div>
        <div className="auth-actions">
          <Link className={buttonClassName("primary")} to="/forgot-password">
            Запросить новую ссылку
          </Link>
          <Link className={buttonClassName("ghost")} to="/login">
            Ко входу
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="auth-card">
      <h1>Новый пароль</h1>
      <p className="auth-sub">Введите новый пароль и повторите его для подтверждения.</p>
      <form onSubmit={submit}>
        <Field label="Новый пароль" htmlFor="reset-password">
          <Input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Повторите пароль" htmlFor="reset-password-confirm">
          <Input
            id="reset-password-confirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        {error ? <div className="auth-status auth-status-error">{error}</div> : null}
        <Button type="submit" block disabled={loading}>
          {loading ? "Сохранение…" : "Сохранить пароль"}
        </Button>
      </form>
    </Card>
  );
}
