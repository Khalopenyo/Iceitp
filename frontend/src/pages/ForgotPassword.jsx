import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../lib/api.js";
import { Card, Field, Input, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";

const genericSuccessMessage =
  "Если этот email зарегистрирован в системе, мы отправили ссылку для восстановления пароля.";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiPost("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Не удалось отправить запрос на восстановление пароля.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="auth-card">
      <h1>Восстановление пароля</h1>
      <p className="auth-sub">Укажите email участника, и мы отправим ссылку для восстановления доступа.</p>

      {submitted ? (
        <>
          <div className="auth-status auth-status-success">{genericSuccessMessage}</div>
          <div className="auth-actions">
            <Link className={buttonClassName("primary")} to="/login">
              Вернуться ко входу
            </Link>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setSubmitted(false);
                setError("");
              }}
            >
              Отправить ещё раз
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          {error ? <div className="auth-status auth-status-error">{error}</div> : null}
          <Button type="submit" block disabled={loading}>
            {loading ? "Отправка…" : "Получить ссылку"}
          </Button>
        </form>
      )}

      <p className="auth-links">
        <Link to="/login">← Ко входу</Link>
      </p>
    </Card>
  );
}
