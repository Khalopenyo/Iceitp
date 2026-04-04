import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../lib/api.js";

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
    <section className="panel narrow">
      <h2>Восстановление пароля</h2>
      <p className="muted">Укажите email участника, и мы отправим ссылку для восстановления доступа.</p>

      {submitted ? (
        <>
          <p className="form-status success">{genericSuccessMessage}</p>
          <div className="form-actions">
            <Link className="btn btn-primary" to="/login">
              Вернуться ко входу
            </Link>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setSubmitted(false);
                setError("");
              }}
            >
              Отправить еще раз
            </button>
          </div>
        </>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error ? <p className="form-status error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Отправка..." : "Получить ссылку"}
          </button>
        </form>
      )}
    </section>
  );
}
