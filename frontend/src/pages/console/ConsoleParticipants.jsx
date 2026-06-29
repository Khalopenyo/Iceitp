import { initials as initialsOf } from "../../lib/format.js";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../../lib/api.js";
import "./console.css";

const EMPTY_FORM = { full_name: "", organization: "", position: "", city: "", degree: "", section_id: "", talk_title: "" };

const initials = (name) => initialsOf(name, "У");

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "author", label: "Докладчики" },
  { key: "listener", label: "Слушатели" },
];

export default function ConsoleParticipants() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [sections, setSections] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(null); // user being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Доступность модалки: Esc закрывает, фон не скроллится, фокус возвращается на триггер.
  useEffect(() => {
    if (!editing) return undefined;
    const prev = document.activeElement;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setEditing(null); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [editing]);

  const openEdit = (u) => {
    const p = u.profile || {};
    setForm({
      full_name: p.full_name || "", organization: p.organization || "", position: p.position || "",
      city: p.city || "", degree: p.degree || "", section_id: p.section_id ? String(p.section_id) : "",
      talk_title: p.talk_title || "",
    });
    setEditing(u);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!form.full_name.trim()) { setToast({ kind: "err", text: "ФИО не может быть пустым." }); return; }
    setSaving(true);
    setToast(null);
    try {
      const updated = await apiPut(`/admin/users/${editing.id}/profile`, {
        full_name: form.full_name.trim(),
        organization: form.organization.trim(),
        position: form.position.trim(),
        city: form.city.trim(),
        degree: form.degree.trim(),
        section_id: form.section_id ? Number(form.section_id) : null,
        talk_title: form.talk_title.trim(),
      });
      setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, profile: updated } : u)));
      setToast({ kind: "ok", text: "Заявка обновлена." });
      setEditing(null);
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сохранить." });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    // role=participant: организатор и команда (org/admin/staff) — не «заявки участников».
    apiGet("/admin/users?role=participant&page_size=100")
      .then((r) => {
        const list = Array.isArray(r) ? r : r?.items || [];
        setUsers(list);
        setTotal(typeof r?.total === "number" ? r.total : list.length);
      })
      .catch(() => setUsers([]));
    apiGet("/admin/sections").then((r) => setSections(Array.isArray(r) ? r : r?.items || [])).catch(() => setSections([]));
  }, []);

  const sectionTitle = (id) => sections.find((s) => String(s.id) === String(id))?.title || "";

  // Предикат поиска/фильтра — общий для таблицы и для экспорта (на полном наборе).
  const matchesFilter = (u) => {
    const p = u.profile || {};
    const isAuthor = Boolean(p.talk_title);
    if (filter === "author" && !isAuthor) return false;
    if (filter === "listener" && isAuthor) return false;
    const q = query.trim().toLowerCase();
    if (q && ![p.full_name, u.email, p.organization, sectionTitle(p.section_id)].filter(Boolean).join(" ").toLowerCase().includes(q)) {
      return false;
    }
    return true;
  };

  const filtered = useMemo(
    () => users.filter(matchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, sections, query, filter]
  );

  const rows = useMemo(
    () =>
      filtered.map((u) => {
        const p = u.profile || {};
        return {
          id: u.id,
          raw: u,
          name: p.full_name || u.email,
          degree: p.degree || "",
          org: p.organization || "",
          section: sectionTitle(p.section_id),
          isAuthor: Boolean(p.talk_title),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, sections]
  );

  const downloadCSV = (records) => {
    const headers = ["ФИО", "E-mail", "Телефон", "Организация", "Должность", "Учёная степень", "Город", "Секция", "Статус"];
    // CSV для RU-Excel: разделитель «;», BOM для кириллицы, экранирование кавычек.
    const esc = (v) => {
      let s = String(v ?? "");
      // Анти-инъекция формул: ведущие = + - @ (и таб/CR) обезвреживаем апострофом — телефон «+7…» тоже.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";")];
    records.forEach((u) => {
      const p = u.profile || {};
      lines.push([
        p.full_name || "", u.email || "", p.phone || "", p.organization || "", p.position || "",
        p.degree || "", p.city || "", sectionTitle(p.section_id), p.talk_title ? "Докладчик" : "Слушатель",
      ].map(esc).join(";"));
    });
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "uchastniki.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Экспорт по ВСЕМУ набору (бэкенд капит page_size=100) — листаем страницы, затем фильтруем.
  const exportCSV = async () => {
    setExporting(true);
    try {
      let all = [];
      let page = 1;
      for (;;) {
        const r = await apiGet(`/admin/users?role=participant&page=${page}&page_size=100`);
        const items = Array.isArray(r) ? r : r?.items || [];
        all = all.concat(items);
        const tot = typeof r?.total === "number" ? r.total : all.length;
        if (!items.length || all.length >= tot || page >= 100) break;
        page += 1;
      }
      downloadCSV(all.filter(matchesFilter));
    } catch {
      downloadCSV(filtered); // на ошибке — хотя бы загруженный набор
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}
      <div className="con-eyebrow">Участники · {total} заявок</div>
      <div className="con-head-row">
        <h2 className="con-h2">Заявки участников</h2>
        <button type="button" className="con-btn con-btn-ghost" onClick={exportCSV} disabled={!filtered.length || exporting}>
          {exporting ? "Экспорт…" : "Экспорт в CSV"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 320, height: 42, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--surface)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени, вузу или секции…" aria-label="Поиск участников" style={{ flex: 1, border: "none", fontSize: 13.5, color: "var(--ink)", background: "transparent", outline: "none", fontFamily: "var(--con-font)" }} />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            style={{
              padding: "9px 14px", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "var(--con-font)",
              fontWeight: filter === f.key ? 600 : 500,
              border: `1px solid ${filter === f.key ? "var(--accent)" : "var(--line)"}`,
              background: filter === f.key ? "var(--accent-wash)" : "var(--surface)",
              color: filter === f.key ? "var(--accent)" : "var(--muted)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="con-card" style={{ padding: 0, overflow: "hidden" }} role="table" aria-label="Заявки участников">
        <div role="row" style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1.6fr 130px 92px", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
          <span role="columnheader">Участник</span><span role="columnheader">Организация</span><span role="columnheader">Секция</span><span role="columnheader">Статус</span><span role="columnheader" style={{ textAlign: "right" }}>Действия</span>
        </div>
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} role="row" style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1.6fr 130px 92px", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
              <div role="cell" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span className="con-av">{initials(r.name)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  {r.degree ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.degree}</div> : null}
                </div>
              </div>
              <span role="cell" style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.org || "—"}</span>
              <span role="cell" style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.section || "—"}</span>
              <span role="cell" className={`con-pill ${r.isAuthor ? "ok" : ""}`}>{r.isAuthor ? "Докладчик" : "Слушатель"}</span>
              <span role="cell" style={{ textAlign: "right" }}>
                <button type="button" className="con-link-btn" onClick={() => openEdit(r.raw)}>Изменить</button>
              </span>
            </div>
          ))
        ) : (
          <div style={{ padding: 36, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            {users.length ? "По запросу ничего не найдено." : "Заявки появятся после публикации сайта."}
          </div>
        )}
      </div>

      {editing ? (
        <div className="con-modal-scrim" role="dialog" aria-modal="true" aria-label="Редактирование заявки" onClick={() => !saving && setEditing(null)}>
          <div className="con-modal" onClick={(e) => e.stopPropagation()}>
            <div className="con-card-title">Заявка участника</div>
            <p className="con-sub" style={{ marginTop: 0 }}>{editing.email}</p>
            <label className="con-field"><span>ФИО</span>
              <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} autoFocus />
            </label>
            <label className="con-field"><span>Организация</span>
              <input value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))} />
            </label>
            <div className="con-form-row2">
              <label className="con-field"><span>Должность</span>
                <input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
              </label>
              <label className="con-field"><span>Учёная степень</span>
                <input value={form.degree} onChange={(e) => setForm((f) => ({ ...f, degree: e.target.value }))} />
              </label>
            </div>
            <div className="con-form-row2">
              <label className="con-field"><span>Город</span>
                <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </label>
              <label className="con-field"><span>Секция</span>
                <select value={form.section_id} onChange={(e) => setForm((f) => ({ ...f, section_id: e.target.value }))}>
                  <option value="">— Без секции —</option>
                  {sections.map((s) => <option key={s.id} value={String(s.id)}>{s.title}</option>)}
                </select>
              </label>
            </div>
            <label className="con-field"><span>Тема доклада (пусто — слушатель)</span>
              <input value={form.talk_title} onChange={(e) => setForm((f) => ({ ...f, talk_title: e.target.value }))} placeholder="Без доклада" />
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="con-btn con-btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Отмена</button>
              <button type="button" className="con-btn" onClick={saveEdit} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
