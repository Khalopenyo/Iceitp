import { initials as initialsOf } from "../../lib/format.js";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api.js";
import "./console.css";

const RATINGS = [0, 5, 4, 3, 2, 1];
const stars = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

const initials = (name) => initialsOf(name, "У");

// ConsoleFeedback — раздел «Отзывы» консоли (перенесён из старого /admin при
// консолидации ADM → /console). Список отзывов участников + средняя оценка.
export default function ConsoleFeedback() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [rating, setRating] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ page: "1", page_size: "100" });
    if (rating) params.set("rating", String(rating));
    if (query.trim()) params.set("q", query.trim());
    apiGet(`/admin/feedback?${params.toString()}`)
      .then((r) => {
        const list = Array.isArray(r) ? r : r?.items || [];
        setItems(list);
        setTotal(typeof r?.total === "number" ? r.total : list.length);
      })
      .catch(() => setItems([]));
  }, [rating, query]);

  const avg = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((s, f) => s + (f.rating || 0), 0) / items.length;
  }, [items]);

  return (
    <div className="con-screen">
      <div className="con-eyebrow">Обратная связь · {total} отзывов</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Отзывы участников</h2>
          <p className="con-sub">
            {items.length ? `Средняя оценка по выборке: ${avg.toFixed(1)} из 5` : "Отзывы появятся после конференции."}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 320, height: 42, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--surface)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени или тексту…" aria-label="Поиск отзывов" style={{ flex: 1, border: "none", fontSize: 13.5, color: "var(--ink)", background: "transparent", outline: "none", fontFamily: "var(--con-font)" }} />
        </div>
        {RATINGS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRating(r)}
            aria-pressed={rating === r}
            style={{
              padding: "9px 14px", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "var(--con-font)",
              fontWeight: rating === r ? 600 : 500,
              border: `1px solid ${rating === r ? "var(--accent)" : "var(--line)"}`,
              background: rating === r ? "var(--accent-wash)" : "var(--surface)",
              color: rating === r ? "var(--accent)" : "var(--muted)",
            }}
          >
            {r === 0 ? "Все" : `${r}★`}
          </button>
        ))}
      </div>

      <div className="con-card" style={{ padding: 0, overflow: "hidden" }}>
        {items.length ? (
          items.map((f) => (
            <div key={f.id} style={{ display: "flex", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
              <span className="con-av" style={{ flex: "none" }}>{initials(f.user_name)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{f.user_name || f.user_email || "Участник"}</span>
                  <span style={{ color: "var(--warn)", letterSpacing: 1, fontSize: 13 }} aria-label={`Оценка ${f.rating} из 5`}>{stars(f.rating || 0)}</span>
                </div>
                {f.comment ? <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{f.comment}</p> : <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>Без комментария</p>}
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: 36, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            {rating || query ? "По фильтру отзывов нет." : "Отзывы появятся после конференции."}
          </div>
        )}
      </div>
    </div>
  );
}
