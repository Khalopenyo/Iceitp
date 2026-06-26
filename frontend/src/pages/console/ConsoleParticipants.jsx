import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api.js";
import "./console.css";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "У";
}

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .map((u) => {
        const p = u.profile || {};
        return {
          id: u.id,
          name: p.full_name || u.email,
          degree: p.degree || "",
          org: p.organization || "",
          section: sectionTitle(p.section_id),
          isAuthor: Boolean(p.talk_title),
        };
      })
      .filter((r) => (filter === "author" ? r.isAuthor : filter === "listener" ? !r.isAuthor : true))
      .filter((r) => !q || [r.name, r.org, r.section].join(" ").toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, sections, query, filter]);

  return (
    <div className="con-screen">
      <div className="con-eyebrow">Участники · {total} заявок</div>
      <h2 className="con-h2" style={{ marginBottom: 22 }}>Заявки участников</h2>

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
        <div role="row" style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1.6fr 130px", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
          <span role="columnheader">Участник</span><span role="columnheader">Организация</span><span role="columnheader">Секция</span><span role="columnheader">Статус</span>
        </div>
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} role="row" style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1.6fr 130px", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
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
            </div>
          ))
        ) : (
          <div style={{ padding: 36, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            {users.length ? "По запросу ничего не найдено." : "Заявки появятся после публикации сайта."}
          </div>
        )}
      </div>
    </div>
  );
}
