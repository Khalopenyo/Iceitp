import { initials as initialsOf } from "../../lib/format.js";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api.js";
import { setUser } from "../../lib/auth.js";
import "./event.css";

const initials = (name) => initialsOf(name, "У");
function maskPhone(phone) {
  const p = String(phone || "").trim();
  if (p.length < 6) return p || "—";
  return `${p.slice(0, p.length - 6)}••• ${p.slice(-2)}`;
}

// EventProfile — профиль участника в зоне EventShell. Просмотр/редактирование данных,
// контакты, согласия 152-ФЗ, управление данными. Логика из старого Profile (LK).
export default function EventProfile() {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/me").then((r) => { setData(r); setProfile(r.profile || {}); }).catch(() => setData(null));
    apiGet("/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
  }, []);

  if (!data) {
    return (
      <div className="ev-page" data-screen-label="Профиль">
        <div className="ev-page-eyebrow">Профиль</div>
        <h1 className="ev-page-h">Профиль и мои данные</h1>
        <p className="ev-empty">{user ? "Загрузка данных участника…" : "Войдите, чтобы открыть профиль."}</p>
      </div>
    );
  }

  const update = (f, v) => setProfile((p) => ({ ...p, [f]: v }));
  const fullName = profile.full_name || "Участник";
  const degreeLine = [profile.position, profile.degree].filter(Boolean).join(", ");
  const selectedSection = sections.find((s) => String(s.id) === String(profile.section_id));

  const save = async () => {
    setSaving(true); setStatus(""); setError("");
    try {
      await apiPut("/me/profile", { ...profile, section_id: profile.section_id ? Number(profile.section_id) : null });
      const fresh = await apiGet("/me");
      setUser(fresh); setData(fresh); setProfile(fresh.profile || {});
      setStatus("Профиль обновлён."); setEditing(false);
    } catch (err) {
      setError(err.message || "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ev-page" data-screen-label="Профиль">
      <div className="ev-page-eyebrow">Личный кабинет</div>
      <div className="ev-profile-head">
        <span className="ev-profile-av" aria-hidden="true">{initials(fullName)}</span>
        <span className="ev-profile-id">
          <b>{fullName}</b>
          <span>{[profile.organization, degreeLine].filter(Boolean).join(" · ") || "Участник конференции"}</span>
        </span>
        <span style={{ flex: 1 }} />
        {!editing ? <button type="button" className="ev-btn-sm ghost" onClick={() => setEditing(true)}>Изменить</button> : null}
      </div>

      {status ? <div className="ev-status ok" role="status">{status}</div> : null}
      {error ? <div className="ev-status err" role="alert">{error}</div> : null}

      <h2 className="ev-dash-card-lab" style={{ color: "var(--ev-accent)" }}>Личные данные</h2>
      <div className="ev-card" style={{ marginBottom: 16 }}>
        {editing ? (
          <>
            <label className="ev-field"><span>ФИО</span><input value={profile.full_name || ""} onChange={(e) => update("full_name", e.target.value)} /></label>
            <label className="ev-field"><span>Организация / вуз</span><input value={profile.organization || ""} onChange={(e) => update("organization", e.target.value)} /></label>
            <div className="ev-cols-2">
              <label className="ev-field"><span>Должность</span><input value={profile.position || ""} onChange={(e) => update("position", e.target.value)} /></label>
              <label className="ev-field"><span>Учёная степень</span><input value={profile.degree || ""} onChange={(e) => update("degree", e.target.value)} /></label>
            </div>
            <label className="ev-field"><span>Город</span><input value={profile.city || ""} onChange={(e) => update("city", e.target.value)} /></label>
            <label className="ev-field"><span>Секция</span>
              <select value={profile.section_id ?? ""} onChange={(e) => update("section_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Выберите секцию</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
            <label className="ev-field" style={{ marginBottom: 0 }}><span>Тема доклада</span><input value={profile.talk_title || ""} onChange={(e) => update("talk_title", e.target.value)} /></label>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="ev-btn-sm primary" onClick={save} disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</button>
              <button type="button" className="ev-btn-sm ghost" onClick={() => { setEditing(false); setProfile(data.profile || {}); setError(""); }}>Отмена</button>
            </div>
          </>
        ) : (
          <>
            <label className="ev-field"><span>ФИО</span><div className="ev-static">{profile.full_name || "—"}</div></label>
            <label className="ev-field"><span>Организация / вуз</span><div className="ev-static">{profile.organization || "—"}</div></label>
            <label className="ev-field"><span>Должность / учёная степень</span><div className="ev-static">{degreeLine || "—"}</div></label>
            {(profile.talk_title || selectedSection) ? (
              <label className="ev-field" style={{ marginBottom: 0 }}><span>Секция и доклад</span>
                <div className="ev-static">{[selectedSection?.title || profile.section_title, profile.talk_title].filter(Boolean).join(" — ") || "—"}</div>
              </label>
            ) : null}
          </>
        )}
      </div>

      {!editing ? (
        <>
          <h2 className="ev-dash-card-lab" style={{ color: "var(--ev-accent)" }}>Контакты и вход</h2>
          <div className="ev-card" style={{ marginBottom: 16 }}>
            <label className="ev-field"><span>E-mail (глобальный аккаунт)</span><div className="ev-static">{data.email || "—"}</div></label>
            <label className="ev-field"><span>Телефон</span><div className="ev-static">{maskPhone(profile.phone)}</div></label>
            <label className="ev-field"><span>Вход по e-mail / телефону</span><div className="ev-static">Пароль задан</div></label>
            <label className="ev-field" style={{ marginBottom: 0 }}><span>Госуслуги (ЕСИА)</span><div className="ev-static">Не привязано · скоро</div></label>
          </div>

          <h2 className="ev-dash-card-lab" style={{ color: "var(--ev-accent)" }}>Согласия 152-ФЗ</h2>
          <div style={{ marginBottom: 16 }}>
            <div className="ev-consent-row">
              <span className="ev-consent-mark ok" aria-hidden="true">✓</span>
              <span><b>Обработка персональных данных</b><span className="ev-consent-sub">выдано при регистрации · 152-ФЗ · <Link to="/personal-data">текст</Link></span></span>
            </div>
            <div className="ev-consent-row">
              <span className="ev-consent-mark ok" aria-hidden="true">✓</span>
              <span><b>Публикация в сборнике трудов</b><span className="ev-consent-sub">выдано при регистрации · <Link to="/consent-authors">текст</Link></span></span>
            </div>
            <div className="ev-consent-row">
              <span className="ev-consent-mark no" aria-hidden="true">—</span>
              <span><b>Фото- и видеосъёмка</b><span className="ev-consent-sub">не выдано</span></span>
            </div>
          </div>

          <div className="ev-card">
            <div className="ev-dash-card-lab">Управление данными</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="ev-btn-sm ghost" to="/personal-data">Экспорт данных</Link>
              <Link className="ev-btn-sm ghost" to="/personal-data">Отозвать согласие</Link>
              <Link className="ev-btn-sm ghost" to="/personal-data">Удалить аккаунт</Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
