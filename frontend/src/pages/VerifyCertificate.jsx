import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { Field, Input, Button } from "../components/ui/index.jsx";
import "./verify-certificate.css";

function formatIssuedAt(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

export default function VerifyCertificate() {
  const [searchParams] = useSearchParams();
  const initialNumber = (searchParams.get("number") || "").trim();
  const [number, setNumber] = useState(initialNumber);
  const [loading, setLoading] = useState(Boolean(initialNumber));
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Deep-link support: /verify?number=... проверяет сертификат при загрузке.
  // setState только в .then/.catch/.finally — синхронных setState в эффекте нет.
  useEffect(() => {
    if (!initialNumber) {
      return undefined;
    }
    apiGet(`/certificates/${encodeURIComponent(initialNumber)}`)
      .then(setResult)
      .catch((err) => setError(err.message || "Сертификат не найден."))
      .finally(() => setLoading(false));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (e) => {
    if (e) {
      e.preventDefault();
    }
    const value = number.trim();
    if (!value) {
      setError("Укажите номер сертификата.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiGet(`/certificates/${encodeURIComponent(value)}`);
      setResult(data);
    } catch (err) {
      setError(err.message || "Сертификат не найден.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="verify-page">
      <h1>Проверка сертификата</h1>
      <p className="verify-sub">
        Введите номер сертификата, чтобы подтвердить его подлинность и узнать, кому и на какой
        конференции он был выдан.
      </p>

      <form className="verify-form" onSubmit={verify}>
        <Field label="Номер сертификата" htmlFor="verify-number">
          <Input
            id="verify-number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Например, CONF-2025-000123"
            autoComplete="off"
          />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? "Проверка…" : "Проверить"}
        </Button>
      </form>

      {error ? (
        <div className="auth-status auth-status-error verify-result" role="alert">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="verify-result" role="status" aria-live="polite">
          <div className="verify-ok">
            <div className="verify-ok-head">
              <span className="verify-ok-check" aria-hidden="true">
                ✓
              </span>
              Сертификат подлинный
            </div>
            <dl className="verify-rows">
              <div className="verify-row">
                <dt>Участник</dt>
                <dd>{result.user?.full_name || "—"}</dd>
              </div>
              <div className="verify-row">
                <dt>Конференция</dt>
                <dd>{result.conference?.title || "—"}</dd>
              </div>
              <div className="verify-row">
                <dt>Номер сертификата</dt>
                <dd>{result.number || "—"}</dd>
              </div>
              <div className="verify-row">
                <dt>Дата выдачи</dt>
                <dd>{formatIssuedAt(result.issued_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  );
}
