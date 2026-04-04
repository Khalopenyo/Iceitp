import { useState } from "react";
import { apiPost } from "../lib/api.js";

const MAX_FEEDBACK_LENGTH = 3000;

export default function Feedback() {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      setErrorMessage("Опишите впечатления о конференции или предложения по улучшению.");
      setStatusMessage("");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await apiPost("/feedback", { rating: Number(rating), comment: trimmedComment });
      setComment("");
      setStatusMessage("Спасибо. Отзыв сохранен и будет доступен оргкомитету в админке.");
    } catch (err) {
      setErrorMessage(err.message || "Не удалось отправить отзыв");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel narrow">
      <h2>Обратная связь</h2>
      <p className="muted">
        Оцените организацию конференции и оставьте предложения по улучшению программы, коммуникации или работы площадки.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Оценка
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value={5}>5 — Отлично</option>
            <option value={4}>4 — Хорошо</option>
            <option value={3}>3 — Нормально</option>
            <option value={2}>2 — Нужно улучшить</option>
            <option value={1}>1 — Плохо</option>
          </select>
        </label>
        <label>
          Отзыв и предложения по улучшению
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
            rows={6}
            placeholder="Например: что сработало хорошо, чего не хватило участникам, какие процессы стоит улучшить к следующей конференции."
          />
        </label>
        <p className="muted">{comment.length} / {MAX_FEEDBACK_LENGTH}</p>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Отправка..." : "Отправить отзыв"}
        </button>
        {statusMessage ? <p className="muted">{statusMessage}</p> : null}
        {errorMessage ? <p className="muted">{errorMessage}</p> : null}
      </form>
    </section>
  );
}
