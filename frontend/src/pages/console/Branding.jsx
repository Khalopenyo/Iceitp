import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiPut } from "../../lib/api.js";
import { applyBranding } from "../../lib/org.js";
import "./console.css";

const PALETTE = ["#4f46e5", "#b42318", "#0f766e", "#1e3a8a", "#15803d", "#b45309"];

function orgMark(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").slice(0, 3).toUpperCase() || "ВУЗ";
}

export default function Branding() {
  const { org, setOrg, conference } = useOutletContext();
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!org) return;
    setName(org.display_name || "");
    setLogoUrl(org.logo_url || "");
    setColor(org.primary_color || "#4f46e5");
  }, [org]);

  const slug = org?.slug || "вуз";
  const confTitle = conference?.title || "Цифровая экономика и общество 2026";

  const save = async () => {
    setSaving(true);
    setToast(null);
    try {
      const updated = await apiPut("/admin/org", {
        display_name: name.trim(),
        logo_url: logoUrl.trim(),
        primary_color: color,
      });
      setOrg(updated);
      applyBranding(updated);
      setToast({ kind: "ok", text: "Брендинг сохранён — участники увидят его на сайте." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сохранить брендинг." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Брендинг · White-label</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Сайт под вашим брендом</h2>
          <p className="con-sub" style={{ maxWidth: 560 }}>
            Платформа нейтральна — участники видят бренд вашего вуза. Загрузите логотип, выберите цвет
            и адрес: остальное соберётся автоматически.
          </p>
        </div>
        <button className="con-btn" onClick={save} disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить брендинг"}
        </button>
      </div>

      <div className="con-brand-grid">
        <div className="con-brand-col">
          <div className="con-card">
            <div className="con-field-label">Логотип вуза</div>
            <div className="con-upload">
              {logoUrl ? (
                <img src={logoUrl} alt="Логотип вуза" />
              ) : (
                <>
                  <div className="con-upload-ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4M5 20h14" /></svg>
                  </div>
                  <div className="con-upload-hint">Вставьте ссылку на PNG или SVG</div>
                </>
              )}
            </div>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.svg"
              className="con-addr-suffix"
              style={{ width: "100%", marginTop: 10, height: 38, borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", padding: "0 12px", justifyContent: "start", fontFamily: "var(--con-font)" }}
              aria-label="Ссылка на логотип"
            />
          </div>

          <div className="con-card">
            <div className="con-field-label">Цвет бренда</div>
            <div className="con-swatches">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`con-swatch ${color === c ? "active" : ""}`}
                  style={{ background: c, color: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Цвет ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
            <div className="con-color-hex">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#4f46e5"}
                onChange={(e) => setColor(e.target.value)}
                style={{ verticalAlign: "middle", marginRight: 8, width: 28, height: 22, border: "none", background: "none", cursor: "pointer" }}
                aria-label="Выбрать цвет"
              />
              {color}
            </div>
          </div>

          <div className="con-card">
            <div className="con-field-label">Адрес сайта</div>
            <div className="con-addr">
              <input value={slug} readOnly aria-label="Поддомен" />
              <span className="con-addr-suffix">.kvorum.ru</span>
            </div>
            <p className="con-sub" style={{ fontSize: 12, margin: "8px 0 0" }}>
              Поддомен закрепляется при подключении тарифа.
            </p>
          </div>
        </div>

        {/* Live-превью сайта участника */}
        <div className="con-preview">
          <div className="con-preview-chrome">
            <span className="con-preview-dot" /><span className="con-preview-dot" /><span className="con-preview-dot" />
            <span className="con-preview-url">{slug}.kvorum.ru</span>
            <span className="con-preview-tag">Предпросмотр для участников</span>
          </div>
          <div className="con-preview-body">
            <div className="con-preview-accent" style={{ background: color }} />
            <div className="con-preview-org">
              <span className="con-preview-logo" style={{ background: color }}>
                {logoUrl ? <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : orgMark(name)}
              </span>
              <span>{name || "Ваш вуз"}</span>
            </div>
            <div className="con-preview-kicker" style={{ color }}>Международная конференция</div>
            <div className="con-preview-title">{confTitle}</div>
            <span className="con-preview-cta" style={{ background: color }}>Зарегистрироваться</span>
          </div>
        </div>
      </div>
    </div>
  );
}
