import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { Input, Button } from "../components/ui/index.jsx";
import "./verify-certificate.css";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function formatRange(from, to) {
  const a = from ? new Date(from) : null;
  const b = to ? new Date(to) : null;
  if (a && !Number.isNaN(a.getTime()) && b && !Number.isNaN(b.getTime())) {
    const opts = { day: "numeric", month: "long", year: "numeric" };
    return `${a.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} – ${b.toLocaleDateString("ru-RU", opts)}`;
  }
  return formatDate(from);
}

export default function VerifyCertificate() {
  const [searchParams] = useSearchParams();
  const initialNumber = (searchParams.get("number") || searchParams.get("code") || "").trim();
  const [number, setNumber] = useState(initialNumber);
  const [loading, setLoading] = useState(Boolean(initialNumber));
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Deep-link: /verify?number=... проверяет сертификат при загрузке.
  useEffect(() => {
    if (!initialNumber) return undefined;
    apiGet(`/certificates/${encodeURIComponent(initialNumber)}`)
      .then(setResult)
      .catch((err) => setError(err.message || "Сертификат не найден."))
      .finally(() => setLoading(false));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (e) => {
    if (e) e.preventDefault();
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

  const revoked = result && result.status === "revoked";

  return (
    <section className="verify-page">
      <h1>Проверка сертификата</h1>
      <p className="verify-sub">
        Введите номер сертификата или отсканируйте QR-код для проверки подлинности.
      </p>

      <form className="verify-form" onSubmit={verify}>
        <span className="verify-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            id="verify-number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Например, DR-2026-001847"
            autoComplete="off"
            aria-label="Номер сертификата"
          />
        </span>
        <Button type="submit" disabled={loading}>
          {loading ? "Проверка…" : "Проверить"}
        </Button>
      </form>

      {error ? (
        <div className="verify-card verify-empty" role="status">
          <div className="verify-state-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <div className="verify-state-title">Сертификат не найден</div>
          <p className="verify-muted">{error}</p>
        </div>
      ) : null}

      {result && revoked ? (
        <div className="verify-card verify-revoked" role="status" aria-live="polite">
          <div className="verify-state-ic verify-state-ic-danger" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="m5.6 5.6 12.8 12.8" />
            </svg>
          </div>
          <div className="verify-chip verify-chip-danger">Отозван</div>
          <div className="verify-state-title">Сертификат аннулирован</div>
          <p className="verify-muted">
            {/* formatDate уже оканчивается на «г.» — точку после даты не дублируем. */}
            {`Сертификат № ${result.number} отозван организатором${
              result.revoked_at ? ` ${formatDate(result.revoked_at)}` : "."
            }`}
            {result.revoke_reason ? ` Причина: ${result.revoke_reason}.` : ""}
          </p>
        </div>
      ) : null}

      {result && !revoked ? (
        <div className="verify-card" role="status" aria-live="polite">
          <div className="verify-chip verify-chip-ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Сертификат действителен
          </div>
          <div className="verify-body">
            <div className="verify-qr" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3M21 14v7h-7M17 21h.01M21 17h.01" />
              </svg>
            </div>
            <dl className="verify-rows">
              <div className="verify-row">
                <dt>Владелец сертификата</dt>
                <dd>{result.user?.full_name || "—"}</dd>
              </div>
              <div className="verify-row">
                <dt>Тип сертификата</dt>
                <dd>{result.type || "Участник"}</dd>
              </div>
              <div className="verify-row">
                <dt>Конференция</dt>
                <dd>
                  {result.conference?.title || "—"}
                  {result.conference?.starts_at ? (
                    <span className="verify-row-note">
                      {formatRange(result.conference.starts_at, result.conference.ends_at)}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="verify-row">
                <dt>Номер и дата</dt>
                <dd>
                  № {result.number}
                  <span className="verify-row-note">Выдан {formatDate(result.issued_at)}</span>
                </dd>
              </div>
            </dl>
          </div>
          <div className="verify-divider" />
          <button type="button" className="verify-download" disabled aria-disabled="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
              <path d="M5 21h14" />
            </svg>
            Скачать копию (PDF)
            <em>скоро</em>
          </button>
        </div>
      ) : null}
    </section>
  );
}
