import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../../lib/api.js";
import "./console.css";

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

export default function ConsoleProgram() {
  const [sections, setSections] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", room: "", start: "", end: "" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiGet("/admin/sections").then((r) => setSections(Array.isArray(r) ? r : r?.items || [])).catch(() => setSections([]));

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.room.trim()) {
      setToast({ kind: "err", text: "Укажите название секции и зал." });
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      await apiPost("/admin/sections", {
        title: form.title.trim(),
        room: form.room.trim(),
        start_at: form.start ? new Date(form.start).toISOString() : null,
        end_at: form.end ? new Date(form.end).toISOString() : null,
      });
      setForm({ title: "", room: "", start: "", end: "" });
      setAdding(false);
      await load();
      setToast({ kind: "ok", text: "Секция добавлена." });
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось добавить секцию." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить секцию?")) return;
    try {
      await apiDelete(`/admin/sections/${id}`);
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
          <p className="con-sub">Принятые доклады распределяются по секциям автоматически.</p>
        </div>
        <button className="con-btn" onClick={() => setAdding((v) => !v)}>+ Добавить секцию</button>
      </div>

      {adding ? (
        <form className="con-card" onSubmit={create} style={{ marginBottom: 14, display: "grid", gap: 12 }}>
          <div className="con-field-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="con-field"><span>Название секции</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Цифровая экономика и финтех" autoFocus />
            </label>
            <label className="con-field"><span>Зал</span>
              <input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Зал A-301" />
            </label>
          </div>
          <div className="con-field-row">
            <label className="con-field"><span>Начало</span>
              <input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label className="con-field"><span>Окончание</span>
              <input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="con-btn" disabled={busy}>{busy ? "Сохраняем…" : "Добавить"}</button>
            <button type="button" className="con-btn con-btn-ghost" onClick={() => setAdding(false)}>Отмена</button>
          </div>
        </form>
      ) : null}

      {sections.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sections.map((s, i) => (
            <div key={s.id} className="con-card" style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) 140px 120px 44px", gap: 14, alignItems: "center", padding: "16px 18px" }}>
              <span style={{ width: 36, height: 36, borderRadius: 9, background: "var(--accent-wash)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--con-mono)", fontSize: 12, fontWeight: 600 }}>С{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{s.title}</div>
                {s.chair ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Председатель: {s.chair}</div> : null}
              </div>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>Зал «{s.room}»</span>
              <span style={{ fontFamily: "var(--con-mono)", fontSize: 13, color: "var(--muted)" }}>{timeRange(s.start_at, s.end_at)}</span>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => remove(s.id)} aria-label="Удалить секцию">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="con-soon">Секций пока нет. Добавьте первую секцию конференции.</div>
      )}
    </div>
  );
}
