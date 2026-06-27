import { useState } from "react";
import { apiPost } from "../../lib/api.js";
import "./event.css";

const MAX_LEN = 3000;
const RATINGS = [
  { value: 5, text: "Отлично" },
  { value: 4, text: "Хорошо" },
  { value: 3, text: "Нормально" },
  { value: 2, text: "Нужно улучшить" },
  { value: 1, text: "Плохо" },
];
const ratingHint = (rating) => {
  switch (Number(rating)) {
    case 5: return "Отметьте, что особенно стоит сохранить в следующей конференции.";
    case 4: return "Укажите, что было хорошо и что можно довести до идеала.";
    case 3: return "Опишите, чего не хватило по программе, коммуникации или навигации.";
    case 2:
    case 1: return "Чем конкретнее замечания, тем быстрее оргкомитет исправит проблему.";
    default: return "";
  }
};

// EventFeedback — «Обратная связь» участника в зоне EventShell (по прототипу:
// оценка 1–5 + текст). Логика из старого Feedback.
export default function EventFeedback() {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      setError("Опишите впечатления о конференции или предложения по улучшению.");
      setStatus("");
      return;
    }
    setLoading(true); setError(""); setStatus("");
    try {
      await apiPost("/feedback", { rating: Number(rating), comment: trimmed });
      setComment("");
      setStatus("Спасибо! Отзыв сохранён и будет доступен оргкомитету.");
    } catch (err) {
      setError(err.message || "Не удалось отправить отзыв.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ev-page" data-screen-label="Обратная связь">
      <div className="ev-page-eyebrow">Обратная связь</div>
      <h1 className="ev-page-h">Оцените конференцию</h1>
      <p className="ev-page-sub">
        Оценка и предложения помогут улучшить программу, коммуникацию и работу площадки.
      </p>

      <form className="ev-card" onSubmit={submit} style={{ maxWidth: 640 }}>
        {status ? <div className="ev-status ok" role="status">{status}</div> : null}
        {error ? <div className="ev-status err" role="alert">{error}</div> : null}

        <div className="ev-field" style={{ marginBottom: 8 }}>
          <span id="ev-rating-label">Общее впечатление</span>
        </div>
        <div className="ev-rating" role="group" aria-labelledby="ev-rating-label">
          {RATINGS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`ev-rating-btn ${Number(rating) === o.value ? "active" : ""}`}
              aria-pressed={Number(rating) === o.value}
              onClick={() => setRating(o.value)}
            >
              <strong>{o.value}</strong>
              <span>{o.text}</span>
            </button>
          ))}
        </div>
        <p className="ev-empty" role="status" style={{ margin: "0 0 16px" }}>{ratingHint(rating)}</p>

        <label className="ev-field">
          <span>Отзыв и предложения по улучшению</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_LEN))}
            rows={6}
            placeholder="Что сработало хорошо, чего не хватило участникам, какие процессы стоит улучшить к следующей конференции."
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--ev-faint)" }}>{comment.length} / {MAX_LEN}</span>
          <button type="submit" className="ev-btn-sm primary" disabled={loading}>
            {loading ? "Отправка…" : "Отправить отзыв"}
          </button>
        </div>
      </form>
    </div>
  );
}
