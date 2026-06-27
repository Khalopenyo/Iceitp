import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api.js";
import "./console.css";

const ROLES = [
  { v: "speaker", label: "Спикер" },
  { v: "orgcommittee", label: "Оргкомитет" },
  { v: "programcommittee", label: "Программный комитет" },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.v, r.label]));
const EMPTY = { full_name: "", role: "speaker", degree: "", organization: "", position: "", bio: "", photo_url: "", sort_order: 0 };

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "—";
}

// ConsoleSpeakers — раздел «Спикеры» (доступен всей команде). CRUD персон
// (спикеры/оргкомитет/программный комитет) через /admin/speakers; питает публичный
// экран «Спикеры», который без этого всегда пуст.
export default function ConsoleSpeakers() {
  const [persons, setPersons] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiGet("/admin/speakers").then((r) => setPersons(Array.isArray(r) ? r : [])).catch(() => setPersons([]));

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
  };
  const openEdit = (p) => {
    setForm({
      full_name: p.full_name || "",
      role: p.role || "speaker",
      degree: p.degree || "",
      organization: p.organization || "",
      position: p.position || "",
      bio: p.bio || "",
      photo_url: p.photo_url || "",
      sort_order: p.sort_order || 0,
    });
    setEditing(p.id);
  };
  const cancel = () => {
    setEditing(null);
    setForm(EMPTY);
  };
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setToast({ kind: "err", text: "Укажите ФИО." });
      return;
    }
    setBusy(true);
    setToast(null);
    const payload = {
      full_name: form.full_name.trim(),
      role: form.role,
      degree: form.degree.trim(),
      organization: form.organization.trim(),
      position: form.position.trim(),
      bio: form.bio.trim(),
      photo_url: form.photo_url.trim(),
      sort_order: Number(form.sort_order) || 0,
    };
    try {
      if (editing === "new") {
        await apiPost("/admin/speakers", payload);
      } else {
        await apiPut(`/admin/speakers/${editing}`, payload);
      }
      cancel();
      await load();
      setToast({ kind: "ok", text: "Сохранено — участники увидят на экране «Спикеры»." });
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось сохранить." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить персону?")) return;
    try {
      await apiDelete(`/admin/speakers/${id}`);
      if (editing === id) cancel();
      await load();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось удалить." });
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Контент сайта</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Спикеры и комитеты</h2>
          <p className="con-sub" style={{ maxWidth: 560 }}>
            Приглашённые докладчики, оргкомитет и программный комитет — публикуются на экране
            «Спикеры». Порядок задаётся полем сортировки.
          </p>
        </div>
        {editing === null ? <button className="con-btn" onClick={openNew}>+ Добавить</button> : null}
      </div>

      {editing !== null ? (
        <form className="con-card" onSubmit={save} style={{ display: "grid", gap: 14, marginBottom: 14 }}>
          <div className="con-field-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="con-field"><span>ФИО</span>
              <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Иванова Мария Петровна" autoFocus />
            </label>
            <label className="con-field"><span>Группа</span>
              <select value={form.role} onChange={(e) => set("role", e.target.value)}>
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </label>
          </div>
          <div className="con-field-row">
            <label className="con-field"><span>Учёная степень / звание</span>
              <input value={form.degree} onChange={(e) => set("degree", e.target.value)} placeholder="д.э.н., профессор" />
            </label>
            <label className="con-field"><span>Должность</span>
              <input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="Заведующий кафедрой" />
            </label>
          </div>
          <div className="con-field-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="con-field"><span>Организация</span>
              <input value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="ГГНТУ им. М. Д. Миллионщикова" />
            </label>
            <label className="con-field"><span>Порядок</span>
              <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} placeholder="0" />
            </label>
          </div>
          <label className="con-field"><span>Фото (ссылка)</span>
            <input value={form.photo_url} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://…/photo.jpg" />
            <span className="con-field-hint">https-ссылка на фото. Если пусто — показываются инициалы.</span>
          </label>
          <label className="con-field"><span>Биография</span>
            <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Короткая справка о спикере (необязательно)." />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="con-btn" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
            <button type="button" className="con-btn con-btn-ghost" onClick={cancel}>Отмена</button>
          </div>
        </form>
      ) : null}

      {persons.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {persons.map((p) => (
            <div key={p.id} className="con-card con-person-row">
              {p.photo_url ? (
                <img src={p.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>{initials(p.full_name)}</span>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{p.full_name}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[p.degree, p.position, p.organization].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span className="con-pill con-person-role">{ROLE_LABEL[p.role] || p.role}</span>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => openEdit(p)} aria-label={`Редактировать ${p.full_name}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => remove(p.id)} aria-label={`Удалить ${p.full_name}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : editing === null ? (
        <div className="con-soon">Пока никого нет. Добавьте спикеров и членов комитетов — они появятся на публичном экране «Спикеры».</div>
      ) : null}
    </div>
  );
}
