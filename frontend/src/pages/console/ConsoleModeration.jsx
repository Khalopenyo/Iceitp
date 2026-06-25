import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api.js";
import "./console.css";

function timeLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ConsoleModeration() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    return apiGet("/admin/questions?status=pending")
      .then((r) => setQuestions(Array.isArray(r) ? r : r?.items || []))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const moderate = async (id, status) => {
    setBusy(id);
    setToast(null);
    try {
      await apiPatch(`/admin/questions/${id}`, { status });
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setToast({ kind: "ok", text: status === "approved" ? "Вопрос одобрен — появится на экране в зале." : "Вопрос отклонён." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось обработать вопрос." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Модерация · вопросы и обратная связь</div>
      <h2 className="con-h2" style={{ marginBottom: 6 }}>Вопросы спикерам</h2>
      <p className="con-sub" style={{ marginBottom: 22 }}>Одобренные вопросы попадают на экран в зале и в карточку доклада.</p>

      {loading ? (
        <div className="con-soon">Загружаем очередь…</div>
      ) : questions.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
          {questions.map((q) => (
            <div key={q.id} className="con-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{q.author_name || "Аноним"}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--con-mono)", fontSize: 11, color: "var(--faint)" }}>{timeLabel(q.created_at)}</span>
              </div>
              <p style={{ margin: "0 0 16px", fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}>{q.text}</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="con-btn"
                  style={{ background: "var(--ok)", padding: "9px 16px", fontSize: 13 }}
                  onClick={() => moderate(q.id, "approved")}
                  disabled={busy === q.id}
                >
                  Одобрить
                </button>
                <button
                  className="con-btn con-btn-ghost"
                  style={{ padding: "9px 16px", fontSize: 13 }}
                  onClick={() => moderate(q.id, "rejected")}
                  disabled={busy === q.id}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="con-card" style={{ maxWidth: 760, textAlign: "center", padding: 48 }}>
          <div style={{ width: 54, height: 54, margin: "0 auto 14px", borderRadius: "50%", background: "var(--ok-wash)", display: "grid", placeItems: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={{ fontFamily: "var(--con-head)", fontWeight: 600, fontSize: 20, color: "var(--ink)" }}>Очередь разобрана</div>
          <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--muted)" }}>Новые вопросы появятся здесь автоматически.</p>
        </div>
      )}
    </div>
  );
}
