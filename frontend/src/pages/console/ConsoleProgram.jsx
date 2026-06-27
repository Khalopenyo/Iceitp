import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api.js";
import "./console.css";

const EMPTY = { title: "", room: "", chair: "", description: "", capacity: 10, start: "", end: "" };

function timeRange(startAt, endAt) {
  const fmt = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1
      ? null
      : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };
  const a = fmt(startAt);
  const b = fmt(endAt);
  if (a && b) return `${a}–${b}`;
  return a || "время не задано";
}
// ISO -> значение для <input type="datetime-local"> (локальное время, без TZ-сдвига).
function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ConsoleProgram() {
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiGet("/admin/sections").then((r) => setSections(Array.isArray(r) ? r : r?.items || [])).catch(() => setSections([]));

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
  };
  const openEdit = (s) => {
    setForm({
      title: s.title || "",
      room: s.room || "",
      chair: s.chair || "",
      description: s.description || "",
      capacity: s.capacity || 0,
      start: toLocalInput(s.start_at),
      end: toLocalInput(s.end_at),
    });
    setEditing(s.id);
  };
  const cancel = () => {
    setEditing(null);
    setForm(EMPTY);
  };
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.room.trim()) {
      setToast({ kind: "err", text: "Укажите название секции и зал." });
      return;
    }
    setBusy(true);
    setToast(null);
    const payload = {
      title: form.title.trim(),
      room: form.room.trim(),
      chair: form.chair.trim(),
      description: form.description.trim(),
      capacity: Number(form.capacity) || 0,
      start_at: form.start ? new Date(form.start).toISOString() : null,
      end_at: form.end ? new Date(form.end).toISOString() : null,
    };
    try {
      if (editing === "new") {
        await apiPost("/admin/sections", payload);
      } else {
        await apiPut(`/admin/sections/${editing}`, payload);
      }
      cancel();
      await load();
      setToast({ kind: "ok", text: "Секция сохранена." });
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось сохранить секцию." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить секцию? Доклады и привязки участников к ней будут откреплены.")) return;
    try {
      await apiDelete(`/admin/sections/${id}`);
      if (editing === id) cancel();
      await load();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось удалить секцию." });
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Конструктор программы</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Секции, залы и расписание</h2>
          <p className="con-sub">Председатель, описание и вместимость показываются на странице секции. Принятые доклады распределяются по секциям автоматически.</p>
        </div>
        {editing === null ? <button className="con-btn" onClick={openNew}>+ Добавить секцию</button> : null}
      </div>

      {editing !== null ? (
        <form className="con-card" onSubmit={save} style={{ marginBottom: 14, display: "grid", gap: 12 }}>
          <div className="con-field-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="con-field"><span>Название секции</span>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Цифровая экономика и финтех" autoFocus />
            </label>
            <label className="con-field"><span>Зал</span>
              <input value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Зал A-301" />
            </label>
          </div>
          <div className="con-field-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="con-field"><span>Председатель</span>
              <input value={form.chair} onChange={(e) => set("chair", e.target.value)} placeholder="Иванова М. П., д.э.н." />
            </label>
            <label className="con-field"><span>Вместимость</span>
              <input type="number" min="0" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="10" />
            </label>
          </div>
          <label className="con-field"><span>Описание секции</span>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="О чём секция — короткий анонс для страницы секции." />
          </label>
          <div className="con-field-row">
            <label className="con-field"><span>Начало</span>
              <input type="datetime-local" value={form.start} onChange={(e) => set("start", e.target.value)} />
            </label>
            <label className="con-field"><span>Окончание</span>
              <input type="datetime-local" value={form.end} onChange={(e) => set("end", e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="con-btn" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
            <button type="button" className="con-btn con-btn-ghost" onClick={cancel}>Отмена</button>
          </div>
        </form>
      ) : null}

      {sections.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sections.map((s, i) => (
            <div key={s.id} className="con-card con-prog-row">
              <span style={{ width: 36, height: 36, borderRadius: 9, background: "var(--accent-wash)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--con-mono)", fontSize: 12, fontWeight: 600 }}>С{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[s.chair ? `Председатель: ${s.chair}` : null, s.capacity ? `до ${s.capacity} чел.` : null].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span className="con-person-role" style={{ fontSize: 13, color: "var(--ink)" }}>Зал «{s.room}»</span>
              <span className="con-person-role" style={{ fontFamily: "var(--con-mono)", fontSize: 13, color: "var(--muted)" }}>{timeRange(s.start_at, s.end_at)}</span>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => openEdit(s)} aria-label={`Редактировать секцию ${s.title}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => remove(s.id)} aria-label={`Удалить секцию ${s.title}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : editing === null ? (
        <div className="con-soon">Секций пока нет. Добавьте первую секцию конференции.</div>
      ) : null}
    </div>
  );
}
