import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPut } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { Field, Input, Select, Button } from "../components/ui/index.jsx";
import { icons as I } from "../components/lkIcons.jsx";
import "./lk.css";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "У";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function maskPhone(phone) {
  const p = String(phone || "").trim();
  if (p.length < 6) return p || "—";
  return `${p.slice(0, p.length - 6)}••• ${p.slice(-2)}`;
}

export default function Profile() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/me")
      .then((r) => {
        setData(r);
        setProfile(r.profile || {});
      })
      .catch(() => setData(null));
    apiGet("/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
  }, []);

  if (!data) {
    return (
      <>
        <div className="lk-topbar">
          <div className="lk-topbar-title">Профиль</div>
        </div>
        <div className="lk-main">
          <div className="lk-card-flat">Войдите, чтобы открыть профиль.</div>
        </div>
      </>
    );
  }

  const update = (f, v) => setProfile((p) => ({ ...p, [f]: v }));
  const fullName = profile.full_name || "Участник";
  const degreeLine = [profile.position, profile.degree].filter(Boolean).join(", ");
  const selectedSection = sections.find((s) => String(s.id) === String(profile.section_id));

  const save = async () => {
    setSaving(true);
    setStatus("");
    setError("");
    try {
      await apiPut("/me/profile", {
        ...profile,
        section_id: profile.section_id ? Number(profile.section_id) : null,
      });
      const fresh = await apiGet("/me");
      setUser(fresh);
      setData(fresh);
      setProfile(fresh.profile || {});
      setStatus("Профиль обновлён.");
      setEditing(false);
    } catch (err) {
      setError(err.message || "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="lk-topbar">
        <button type="button" className="lk-iconbtn" onClick={() => navigate(-1)} aria-label="Назад">
          {I.back}
        </button>
        <div className="lk-topbar-title">Профиль и мои данные</div>
        <div className="lk-spacer" />
        {!editing ? (
          <button type="button" className="lk-topbar-action" onClick={() => setEditing(true)}>
            {I.edit} Изменить
          </button>
        ) : null}
      </div>

      <div className="lk-main">
        <div className="lk-card-flat" style={{ textAlign: "center" }}>
          <div className="lk-avatar" style={{ width: "56px", height: "56px", fontSize: "18px", margin: "0 auto 8px" }}>
            {initials(fullName)}
          </div>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>{fullName}</div>
          {(profile.organization || degreeLine) ? (
            <div className="lk-topbar-sub" style={{ marginTop: "2px" }}>
              {[profile.organization, degreeLine].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </div>

        {status ? <div className="ui-status ui-status-success" role="status" style={{ marginTop: "10px" }}>{status}</div> : null}
        {error ? <div className="ui-status ui-status-error" role="alert" style={{ marginTop: "10px" }}>{error}</div> : null}

        <div className="lk-h3">Личные данные</div>
        <div className="lk-card">
          {editing ? (
            <>
              <Field label="ФИО" htmlFor="pf-name"><Input id="pf-name" value={profile.full_name || ""} onChange={(e) => update("full_name", e.target.value)} /></Field>
              <Field label="Организация / вуз" htmlFor="pf-org"><Input id="pf-org" value={profile.organization || ""} onChange={(e) => update("organization", e.target.value)} /></Field>
              <Field label="Должность" htmlFor="pf-pos"><Input id="pf-pos" value={profile.position || ""} onChange={(e) => update("position", e.target.value)} /></Field>
              <Field label="Учёная степень" htmlFor="pf-deg"><Input id="pf-deg" value={profile.degree || ""} onChange={(e) => update("degree", e.target.value)} /></Field>
              <Field label="Город" htmlFor="pf-city"><Input id="pf-city" value={profile.city || ""} onChange={(e) => update("city", e.target.value)} /></Field>
              <Field label="Секция" htmlFor="pf-sec">
                <Select id="pf-sec" value={profile.section_id ?? ""} onChange={(e) => update("section_id", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Выберите секцию</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Тема доклада" htmlFor="pf-talk"><Input id="pf-talk" value={profile.talk_title || ""} onChange={(e) => update("talk_title", e.target.value)} /></Field>
            </>
          ) : (
            <>
              <Field label="ФИО"><div className="ui-input ui-input-static">{profile.full_name || "—"}</div></Field>
              <Field label="Организация / вуз"><div className="ui-input ui-input-static">{profile.organization || "—"}</div></Field>
              <Field label="Должность / учёная степень"><div className="ui-input ui-input-static">{degreeLine || "—"}</div></Field>
              {(profile.talk_title || selectedSection) ? (
                <Field label="Секция и доклад">
                  <div className="ui-input ui-input-static">
                    {[selectedSection?.title || profile.section_title, profile.talk_title].filter(Boolean).join(" — ") || "—"}
                  </div>
                </Field>
              ) : null}
            </>
          )}
        </div>

        {editing ? (
          <div className="lk-chips" style={{ marginTop: "12px" }}>
            <Button onClick={save} disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setProfile(data.profile || {}); setError(""); }}>
              Отмена
            </Button>
          </div>
        ) : null}

        {!editing ? (
          <>
            <div className="lk-h3">Контакты и вход</div>
            <div className="lk-card">
              <Field label="E-mail (глобальный аккаунт)"><div className="ui-input ui-input-static">{data.email || "—"}</div></Field>
              <Field label="Телефон"><div className="ui-input ui-input-static">{maskPhone(profile.phone)}</div></Field>
              <div className="lk-list" style={{ marginTop: "4px" }}>
                <div className="lk-li" style={{ cursor: "default" }}>
                  <span className="lk-li-ic">{I.key}</span>
                  <span className="lk-li-tx"><b>Вход по e-mail / телефону</b><span>пароль задан</span></span>
                </div>
                <div className="lk-li disabled">
                  <span className="lk-li-ic">{I.shield}</span>
                  <span className="lk-li-tx"><b>ЕСИА</b><span>не привязано · скоро</span></span>
                </div>
              </div>
            </div>

            <div className="lk-h3">Согласия 152-ФЗ</div>
            <div className="lk-list">
              <div className="lk-li" style={{ cursor: "default" }}>
                <span className="lk-li-ic" style={{ background: "var(--gr-50)", color: "var(--gr-700)" }}>{I.ok}</span>
                <span className="lk-li-tx">
                  <b>Обработка персональных данных</b>
                  <span>выдано при регистрации · 152-ФЗ · <Link to="/personal-data">текст</Link></span>
                </span>
              </div>
              <div className="lk-li" style={{ cursor: "default" }}>
                <span className="lk-li-ic" style={{ background: "var(--gr-50)", color: "var(--gr-700)" }}>{I.ok}</span>
                <span className="lk-li-tx">
                  <b>Публикация в сборнике трудов</b>
                  <span>выдано при регистрации · <Link to="/consent-authors">текст</Link></span>
                </span>
              </div>
              <div className="lk-li" style={{ cursor: "default" }}>
                <span className="lk-li-ic" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>{I.no}</span>
                <span className="lk-li-tx"><b>Фото- и видеосъёмка</b><span>не выдано</span></span>
              </div>
            </div>

            <div className="lk-card-flat" style={{ marginTop: "12px" }}>
              <div className="lk-label" style={{ marginBottom: "8px" }}>Управление данными</div>
              <div className="lk-chips" style={{ marginBottom: "8px" }}>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => navigate("/personal-data")}>
                  {I.download} Экспорт данных
                </button>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => navigate("/personal-data")}>
                  {I.ban} Отозвать согласие
                </button>
              </div>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-block" onClick={() => navigate("/personal-data")}>
                {I.trash} Удалить аккаунт в конференции
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
