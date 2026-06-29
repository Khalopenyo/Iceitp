import Toast from "../../components/Toast.jsx";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiPut, apiPostForm } from "../../lib/api.js";
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
  const [theme, setTheme] = useState("academic");
  const [customDomain, setCustomDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const uploadLogo = async (file) => {
    if (!file) return;
    // Клиентская проверка до отправки (сервер всё равно валидирует ещё раз).
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (file.type && !allowed.includes(file.type)) {
      setToast({ kind: "err", text: "Поддерживаются PNG, JPEG, WEBP или SVG." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast({ kind: "err", text: "Файл больше 2 МБ — выберите меньше." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    setToast(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await apiPostForm("/admin/org/logo", fd);
      setOrg(updated);
      setLogoUrl(updated.logo_url || "");
      applyBranding(updated);
      setToast({ kind: "ok", text: "Логотип загружен." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось загрузить логотип." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!org) return;
    setName(org.display_name || "");
    setLogoUrl(org.logo_url || "");
    setColor(org.primary_color || "#4f46e5");
    setTheme(org.theme || "academic");
    setCustomDomain(org.custom_domain || "");
  }, [org]);

  const slug = org?.slug || "вуз";
  const confTitle = conference?.title || "Название конференции";

  const save = async () => {
    setSaving(true);
    setToast(null);
    try {
      const updated = await apiPut("/admin/org", {
        display_name: name.trim(),
        logo_url: logoUrl.trim(),
        primary_color: color,
        theme,
        custom_domain: customDomain.trim(),
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
      <Toast toast={toast} />

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
                <img src={logoUrl} alt="Логотип вуза" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <>
                  <div className="con-upload-ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4M5 20h14" /></svg>
                  </div>
                  <div className="con-upload-hint">Загрузите файл (PNG, JPEG, WEBP, SVG) или вставьте ссылку</div>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="con-btn con-btn-ghost" style={{ flex: "none" }} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "Загрузка…" : "Загрузить файл"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => uploadLogo(e.target.files?.[0])}
                style={{ display: "none" }}
              />
              <span className="con-sub" style={{ margin: 0, alignSelf: "center", fontSize: 12 }}>PNG, JPEG, WEBP или SVG, до 2 МБ</span>
            </div>
            <div className="con-field-label" style={{ marginTop: 12 }}>…или ссылка на логотип</div>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.svg"
              className="con-addr-suffix"
              style={{ width: "100%", marginTop: 6, height: 38, borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", padding: "0 12px", justifyContent: "start", fontFamily: "var(--con-font)" }}
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
            <div className="con-field-label" style={{ marginTop: 16 }}>Свой домен (необязательно)</div>
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="conf.university.ru"
              aria-label="Кастомный домен"
              style={{ width: "100%", height: 38, borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", padding: "0 12px", fontFamily: "var(--con-font)", fontSize: 14, color: "var(--ink)" }}
            />
            <p className="con-sub" style={{ fontSize: 12, margin: "8px 0 0" }}>
              Укажите свой домен и направьте на платформу CNAME-записью. Подключение домена и TLS — на стороне платформы.
            </p>
          </div>

          <div className="con-card">
            <div className="con-field-label">Стиль сайта</div>
            <div className="con-theme-row" role="group" aria-label="Направление оформления">
              {[
                { v: "academic", t: "Академик", d: "Сериф-заголовки, светлый сайдбар" },
                { v: "digital", t: "Цифровой", d: "Брендовый сайдбар, крупный гротеск" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  className={`con-theme-opt ${theme === opt.v ? "active" : ""}`}
                  onClick={() => setTheme(opt.v)}
                  aria-pressed={theme === opt.v}
                >
                  <b>{opt.t}</b>
                  <span>{opt.d}</span>
                </button>
              ))}
            </div>
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
