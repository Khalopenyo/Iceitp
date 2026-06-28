import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../../lib/api.js";
import { applyBranding } from "../../lib/org.js";
import "./console.css";

const FORMATS = [
  { v: "hybrid", label: "Очно и онлайн" },
  { v: "offline", label: "Только очно" },
  { v: "online", label: "Только онлайн" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [format, setFormat] = useState("hybrid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Если конференция уже настроена — онбординг не нужен, уводим в консоль.
    apiGet("/admin/conference")
      .then((c) => {
        if (c?.onboarded) {
          navigate("/console", { replace: true });
          return;
        }
        if (c?.title && c.title !== "Новая конференция") setTitle(c.title);
      })
      .catch(() => {});
    apiGet("/admin/org").then((o) => setOrg(o?.display_name || "")).catch(() => {});
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Укажите название конференции.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiPost("/admin/conference", {
        title: title.trim(),
        organization: org.trim(),
        starts_at: startsAt ? new Date(`${startsAt}T10:00:00`).toISOString() : null,
        ends_at: endsAt ? new Date(`${endsAt}T18:00:00`).toISOString() : null,
        format,
      });
      const fresh = await apiGet("/admin/org").catch(() => null);
      if (fresh) applyBranding(fresh);
      navigate("/console", { replace: true });
    } catch (err) {
      setError(err.message || "Не удалось создать конференцию.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="con-root">
      <div className="con-onboard">
        <div className="con-onboard-top">
          <span className="con-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg>
          </span>
          <span className="con-logo-name">Кворум</span>
          <span className="con-onboard-top-note">Рабочее пространство готово</span>
        </div>

        <div className="con-onboard-main">
          <form className="con-onboard-inner" onSubmit={submit}>
            <div className="con-onboard-eyebrow">Шаг 1 из 3 · Создание конференции</div>
            <h1 className="con-onboard-h1">Добро пожаловать в Кворум</h1>
            <p className="con-onboard-sub">
              Создайте первую конференцию — программу, бейджи и сборник платформа соберёт
              автоматически.
            </p>

            <div className="con-onboard-card">
              {error ? <div className="con-toast err" role="alert">{error}</div> : null}
              <label className="con-field">
                <span>Название конференции</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Цифровая экономика 2026" autoFocus />
              </label>
              <label className="con-field">
                <span>Организация / вуз</span>
                <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Название вашего вуза" />
              </label>
              <div className="con-field-row">
                <label className="con-field">
                  <span>Дата начала</span>
                  <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </label>
                <label className="con-field">
                  <span>Дата окончания</span>
                  <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </label>
              </div>
              <div>
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "8px" }}>Формат участия</span>
                <div className="con-format-row">
                  {FORMATS.map((f) => (
                    <button key={f.v} type="button" className={`con-format ${format === f.v ? "active" : ""}`} onClick={() => setFormat(f.v)} aria-pressed={format === f.v}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="con-btn" style={{ width: "100%", height: "48px", justifyContent: "center", marginTop: "8px" }} disabled={saving}>
                {saving ? "Создаём…" : "Создать конференцию →"}
              </button>
            </div>

            <div className="con-steps">
              <div className="con-step active"><span className="con-step-num">1</span>Создать</div>
              <div className="con-step"><span className="con-step-num">2</span>Настроить программу</div>
              <div className="con-step"><span className="con-step-num">3</span>Пригласить участников</div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
