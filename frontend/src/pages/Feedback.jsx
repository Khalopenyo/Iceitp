import { useState } from "react";
import { apiPost } from "../lib/api.js";

export default function Feedback() {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/feedback", { rating: Number(rating), comment });
      setComment("");
      alert("Спасибо за отзыв!");
    } catch (err) {
      alert("Не удалось отправить отзыв");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel narrow">
      <h2>Обратная связь</h2>
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
          Предложения по улучшению
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Отправка..." : "Отправить отзыв"}
        </button>
      </form>
    </section>
  );
}
