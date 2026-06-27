import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api.js";
import "./console.css";

// Типы «готовых блоков» лендинга (whitelist на бэкенде, models.ContentBlockKinds).
const KINDS = [
  { v: "about", label: "О конференции" },
  { v: "schedule", label: "Анонс программы" },
  { v: "speakers", label: "Спикеры" },
  { v: "venue", label: "Площадка" },
  { v: "contacts", label: "Контакты" },
  { v: "hero", label: "Шапка" },
  { v: "custom", label: "Произвольный блок" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.v, k.label]));
const EMPTY = { kind: "about", title: "", body: "", position: 0, visible: true };

export default function ConsoleContent() {
  const [blocks, setBlocks] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragId, setDragId] = useState(null);

  const load = () =>
    apiGet("/admin/content").then((r) => setBlocks(Array.isArray(r) ? r : [])).catch(() => setBlocks([]));

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    // Новый блок — в конец (макс. позиция + 1).
    const nextPos = blocks.reduce((m, b) => Math.max(m, b.position || 0), 0) + 1;
    setForm({ ...EMPTY, position: nextPos });
    setEditing("new");
  };
  const openEdit = (b) => {
    setForm({ kind: b.kind || "about", title: b.title || "", body: b.body || "", position: b.position || 0, visible: b.visible !== false });
    setEditing(b.id);
  };
  const cancel = () => {
    setEditing(null);
    setForm(EMPTY);
  };
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim() && !form.body.trim()) {
      setToast({ kind: "err", text: "Заполните заголовок или текст блока." });
      return;
    }
    setBusy(true);
    setToast(null);
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      body: form.body,
      position: Number(form.position) || 0,
      visible: form.visible,
    };
    try {
      if (editing === "new") {
        await apiPost("/admin/content", payload);
      } else {
        await apiPut(`/admin/content/${editing}`, payload);
      }
      cancel();
      await load();
      setToast({ kind: "ok", text: "Блок сохранён — он появится на главной сайта." });
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось сохранить блок." });
    } finally {
      setBusy(false);
    }
  };

  const toggleVisible = async (b) => {
    try {
      await apiPut(`/admin/content/${b.id}`, {
        kind: b.kind, title: b.title, body: b.body, position: b.position, visible: !b.visible,
      });
      await load();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось изменить видимость." });
    }
  };

  // Drag-reorder: перетаскиваем строки, проставляем position=индекс и сохраняем изменившиеся.
  // Поле «Позиция» в форме остаётся для клавиатурного/точного управления (a11y-фолбэк).
  const onDrop = async (targetId) => {
    if (dragId == null || dragId === targetId) { setDragId(null); return; }
    const prev = blocks;
    const ordered = [...blocks];
    const from = ordered.findIndex((b) => b.id === dragId);
    const to = ordered.findIndex((b) => b.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const repositioned = ordered.map((b, i) => ({ ...b, position: i + 1 }));
    setBlocks(repositioned);
    const changed = repositioned.filter((b) => (prev.find((x) => x.id === b.id)?.position) !== b.position);
    try {
      await Promise.all(changed.map((b) =>
        apiPut(`/admin/content/${b.id}`, { kind: b.kind, title: b.title, body: b.body, position: b.position, visible: b.visible })
      ));
      setToast({ kind: "ok", text: "Порядок блоков сохранён." });
      await load();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось сохранить порядок." });
      await load();
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить блок?")) return;
    try {
      await apiDelete(`/admin/content/${id}`);
      if (editing === id) cancel();
      await load();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось удалить блок." });
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Контент сайта</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Блоки главной страницы</h2>
          <p className="con-sub" style={{ maxWidth: 560 }}>
            Дополнительные секции лендинга: «О конференции», контакты, произвольный текст. Порядок —
            перетаскиванием строк или полем «Позиция»; скрытые блоки на сайте не показываются.
          </p>
        </div>
        {editing === null ? <button className="con-btn" onClick={openNew}>+ Добавить блок</button> : null}
      </div>

      {editing !== null ? (
        <form className="con-card" onSubmit={save} style={{ display: "grid", gap: 14, marginBottom: 14 }}>
          <div className="con-field-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="con-field"><span>Тип блока</span>
              <select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
                {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
              </select>
            </label>
            <label className="con-field"><span>Позиция</span>
              <input type="number" min="0" value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="0" />
            </label>
          </div>
          <label className="con-field"><span>Заголовок</span>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="О конференции" autoFocus />
          </label>
          <label className="con-field"><span>Текст</span>
            <textarea value={form.body} onChange={(e) => set("body", e.target.value)} placeholder="Текст блока. Каждый абзац — с новой строки." style={{ minHeight: 130 }} />
          </label>
          <label className="con-check" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "var(--ink)" }}>
            <input type="checkbox" checked={form.visible} onChange={(e) => set("visible", e.target.checked)} />
            Показывать блок на сайте
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="con-btn" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
            <button type="button" className="con-btn con-btn-ghost" onClick={cancel}>Отмена</button>
          </div>
        </form>
      ) : null}

      {blocks.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {blocks.map((b) => (
            <div
              key={b.id}
              className="con-card con-block-row"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(b.id)}
              style={{ opacity: dragId === b.id ? 0.5 : 1 }}
            >
              <span
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(b.id)); e.dataTransfer.effectAllowed = "move"; setDragId(b.id); }}
                onDragEnd={() => setDragId(null)}
                title="Перетащите за номер, чтобы изменить порядок"
                style={{ width: 36, height: 36, borderRadius: 9, background: "var(--accent-wash)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--con-mono)", fontSize: 13, fontWeight: 600, cursor: "grab" }}
              >{b.position}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{b.title || <span style={{ color: "var(--faint)" }}>(без заголовка)</span>}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.body ? b.body.replace(/\s+/g, " ").slice(0, 80) : "—"}
                </div>
              </div>
              <span className="con-pill con-person-role">{KIND_LABEL[b.kind] || b.kind}</span>
              <button className="con-btn con-btn-ghost con-person-role" style={{ height: 32, padding: "0 10px", fontSize: 12.5 }} onClick={() => toggleVisible(b)} aria-label={b.visible ? "Скрыть блок" : "Показать блок"}>
                {b.visible ? "Скрыть" : "Показать"}
              </button>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => openEdit(b)} aria-label={`Редактировать блок ${b.title || b.kind}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>
              <button className="con-btn con-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={() => remove(b.id)} aria-label={`Удалить блок ${b.title || b.kind}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : editing === null ? (
        <div className="con-soon">Блоков пока нет. Добавьте, например, «О конференции» — он появится на главной странице сайта.</div>
      ) : null}
    </div>
  );
}
