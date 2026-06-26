import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../lib/api.js";
import "./console.css";

function hhmm(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function ConsoleCheckin() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({ checked_in: 0, total: 0 });
  // Server truth: ids already checked in (survives reload / другой стендист).
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [busy, setBusy] = useState(0);
  const [toast, setToast] = useState(null);

  const loadRecent = () =>
    apiGet("/admin/checkin/recent")
      .then((d) => {
        setRecent(d?.recent || []);
        setStats(d?.stats || { checked_in: 0, total: 0 });
        setCheckedIds(new Set(d?.checked_in_ids || []));
      })
      .catch(() => {});

  useEffect(() => {
    loadRecent();
  }, []);

  // Auto-dismiss a toast so stale feedback doesn't linger through the fast on-site flow.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pct = useMemo(() => {
    const t = stats.total || 0;
    return t > 0 ? Math.min(100, Math.round(((stats.checked_in || 0) / t) * 100)) : 0;
  }, [stats]);

  const search = async (e) => {
    e?.preventDefault();
    setToast(null);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await apiGet(`/admin/users?role=participant&user_type=offline&q=${encodeURIComponent(q)}&page_size=20`);
      setResults(Array.isArray(r) ? r : r?.items || []);
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось найти участников." });
    } finally {
      setSearching(false);
    }
  };

  const mark = async (user) => {
    setBusy(user.id);
    setToast(null);
    try {
      const res = await apiPost("/admin/checkin/manual", { user_id: user.id });
      setCheckedIds((prev) => new Set(prev).add(user.id));
      setToast({
        kind: "ok",
        text: res?.already_checked_in
          ? `${user.profile?.full_name || user.email} уже отмечен(а).`
          : `${user.profile?.full_name || user.email} отмечен(а) на входе.`,
      });
      loadRecent();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось отметить участника." });
    } finally {
      setBusy(0);
    }
  };

  return (
    <div className="con-screen">
      {/* Постоянные live-области: надёжно озвучивают результат, даже когда видимый тост монтируется. */}
      <div className="con-sr-only" role="status" aria-live="polite">{toast && toast.kind === "ok" ? toast.text : ""}</div>
      <div className="con-sr-only" role="alert">{toast && toast.kind === "err" ? toast.text : ""}</div>
      {toast ? <div className={`con-toast ${toast.kind}`} aria-hidden="true">{toast.text}</div> : null}

      <div className="con-eyebrow">Регистрация на месте</div>
      <h2 className="con-h2" style={{ marginBottom: 22 }}>Отметить участников на входе</h2>

      <div className="con-checkin-grid">
        {/* Левая карточка: поиск участника + отметка + прогресс */}
        <div className="con-card">
          <form onSubmit={search} className="con-checkin-search">
            <input
              className="con-input-static"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени или e-mail"
              aria-label="Поиск участника"
            />
            <button type="submit" className="con-btn" disabled={searching}>
              {searching ? "Ищем…" : "Найти"}
            </button>
          </form>

          <div className="con-checkin-results" role={results.length ? "list" : undefined}>
            {results.length === 0 ? (
              <p className="con-sub" style={{ margin: "10px 2px" }}>
                {query.trim() ? "Никого не нашли — уточните запрос." : "Введите имя участника, чтобы отметить его на входе."}
              </p>
            ) : (
              results.map((u) => {
                const done = checkedIds.has(u.id);
                return (
                  <div className="con-checkin-row" role="listitem" key={u.id}>
                    <span className="con-checkin-av">{(u.profile?.full_name || u.email || "?").slice(0, 1).toUpperCase()}</span>
                    <span className="con-checkin-tx">
                      <b>{u.profile?.full_name || u.email}</b>
                      <span>{u.profile?.organization || u.email}</span>
                    </span>
                    <button
                      type="button"
                      className={`con-btn ${done ? "con-btn-ghost" : ""}`}
                      onClick={() => mark(u)}
                      disabled={done || busy === u.id}
                      style={done ? { color: "var(--ok)", cursor: "default" } : undefined}
                    >
                      {done ? "Отмечен ✓" : busy === u.id ? "…" : "Отметить"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="con-checkin-progress">
            <div>
              <div className="con-checkin-count">{stats.checked_in ?? 0}<span> / {stats.total ?? 0}</span></div>
              <div className="con-checkin-note">отмечено всего</div>
            </div>
            <div
              className="con-checkin-bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Отмечено на входе"
            >
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Правая карточка: лента отметившихся */}
        <div className="con-card">
          <div className="con-card-title">Отметившиеся только что</div>
          {recent.length === 0 ? (
            <p className="con-sub" style={{ margin: 0 }}>Пока никто не отметился.</p>
          ) : (
            recent.map((c) => (
              <div className="con-checkin-recent" key={`${c.user_id}-${c.checked_in_at}`}>
                <span className="con-checkin-tick" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                <span className="con-checkin-tx">
                  <b>{c.name}</b>
                  <span>{c.section || "Без секции"}</span>
                </span>
                <span className="con-checkin-time">{hhmm(c.checked_in_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
